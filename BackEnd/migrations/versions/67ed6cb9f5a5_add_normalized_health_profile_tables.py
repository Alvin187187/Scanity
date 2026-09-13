"""Add normalized health profile tables

Revision ID: 67ed6cb9f5a5
Revises: c4f2a8d91e07
Create Date: 2026-09-13 21:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '67ed6cb9f5a5'
down_revision: Union[str, None] = 'c4f2a8d91e07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================================
    # STEP 1 — Drop old tables being fully replaced by the new
    # normalized schema. Safe since all current data is disposable.
    # CASCADE removes dependent FK constraints on tables we're
    # keeping (e.g. product_ingredients -> product) without
    # dropping those kept tables themselves.
    # ============================================================
    op.execute("DROP TABLE IF EXISTS product_nutrition_rules CASCADE")
    op.execute("DROP TABLE IF EXISTS allergies CASCADE")
    op.execute("DROP TABLE IF EXISTS nutrition_rule CASCADE")
    op.execute("DROP TABLE IF EXISTS scan_history CASCADE")
    op.execute("DROP TABLE IF EXISTS product CASCADE")

    # ============================================================
    # STEP 2 — Truncate tables being kept but retyped, so the
    # INTEGER -> UUID column changes below have nothing to cast.
    # CASCADE clears anything still referencing these via FK.
    # ============================================================
    op.execute("TRUNCATE TABLE users, health_profiles, ingredients, product_ingredients CASCADE")

    # ============================================================
    # STEP 3 — Retype columns now that the tables are empty.
    # No USING clause needed since there's no data to convert.
    # ============================================================
    # Drop the FK pointing at users.user_id BEFORE retyping it — Postgres
    # won't let you change the type of a column something still references
    op.execute("ALTER TABLE health_profiles DROP CONSTRAINT IF EXISTS health_profiles_user_id_fkey")

    op.execute("ALTER TABLE users ALTER COLUMN user_id DROP DEFAULT")
    op.alter_column('users', 'user_id',
               existing_type=sa.INTEGER(),
               type_=sa.UUID(),
               existing_nullable=False,
               postgresql_using='gen_random_uuid()')
    op.alter_column('users', 'full_name',
               existing_type=sa.VARCHAR(length=255),
               nullable=True)
    op.alter_column('users', 'email',
               existing_type=sa.VARCHAR(length=255),
               nullable=True)
    op.drop_constraint('users_auth_uid_key', 'users', type_='unique')
    op.drop_constraint('users_email_key', 'users', type_='unique')
    op.drop_constraint('users_username_key', 'users', type_='unique')
    op.drop_column('users', 'auth_uid')
    op.drop_column('users', 'username')

    op.alter_column('health_profiles', 'user_id',
               existing_type=sa.INTEGER(),
               type_=sa.UUID(),
               existing_nullable=True,
               postgresql_using='gen_random_uuid()')
    op.drop_constraint('health_profiles_user_id_key', 'health_profiles', type_='unique')
    op.drop_column('health_profiles', 'health_profile_id')
    op.drop_column('health_profiles', 'dietary_condition')
    op.drop_column('health_profiles', 'health_condition')

    # Re-add the FK now that both sides are UUID
    op.create_foreign_key(
        'health_profiles_user_id_fkey', 'health_profiles', 'users',
        ['user_id'], ['user_id'], ondelete='CASCADE',
    )

    op.add_column('ingredients', sa.Column('common_name', sa.String(length=100), nullable=True))
    op.execute("ALTER TABLE product_ingredients DROP CONSTRAINT IF EXISTS product_ingredients_ingredient_id_fkey")
    op.execute("ALTER TABLE ingredients ALTER COLUMN ingredient_id DROP DEFAULT")
    op.alter_column('ingredients', 'ingredient_id',
               existing_type=sa.INTEGER(),
               type_=sa.UUID(),
               existing_nullable=False,
               postgresql_using='gen_random_uuid()')
    op.alter_column('ingredients', 'ingredient_name',
               existing_type=sa.VARCHAR(length=100),
               nullable=True)
    op.drop_column('ingredients', 'is_allergen')
    op.add_column('ingredients', sa.Column('is_allergen', sa.Boolean(), nullable=True))

    op.alter_column('product_ingredients', 'product_id',
               existing_type=sa.INTEGER(),
               type_=sa.UUID(),
               existing_nullable=False,
               postgresql_using='gen_random_uuid()')
    op.alter_column('product_ingredients', 'ingredient_id',
               existing_type=sa.INTEGER(),
               type_=sa.UUID(),
               existing_nullable=False,
               postgresql_using='gen_random_uuid()')

    # Re-add the FK now that both sides are UUID
    op.create_foreign_key(
        'product_ingredients_ingredient_id_fkey', 'product_ingredients', 'ingredients',
        ['ingredient_id'], ['ingredient_id'],
    )

    # ============================================================
    # STEP 4 — Now create the new tables. All FK targets
    # (users.user_id, products.product_id, etc.) are already UUID
    # by this point, so these creations will succeed.
    # ============================================================
    op.create_table('allergy_types',
    sa.Column('allergy_type_id', sa.UUID(), nullable=False),
    sa.Column('allergen_name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('allergy_type_id'),
    sa.UniqueConstraint('allergen_name')
    )
    op.create_table('health_condition_types',
    sa.Column('condition_type_id', sa.UUID(), nullable=False),
    sa.Column('condition_name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('condition_type_id'),
    sa.UniqueConstraint('condition_name')
    )
    op.create_table('nutrition_rules',
    sa.Column('rule_id', sa.UUID(), nullable=False),
    sa.Column('condition_type_id', sa.UUID(), nullable=True),
    sa.Column('nutrient_name', sa.String(length=100), nullable=False),
    sa.Column('operator', sa.String(length=10), nullable=False),
    sa.Column('threshold_value', sa.Float(), nullable=False),
    sa.Column('unit', sa.String(length=20), nullable=False),
    sa.Column('recommendation_reason', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['condition_type_id'], ['health_condition_types.condition_type_id'], ),
    sa.PrimaryKeyConstraint('rule_id')
    )
    op.create_table('products',
    sa.Column('product_id', sa.UUID(), nullable=False),
    sa.Column('barcode', sa.String(length=50), nullable=False),
    sa.Column('product_name', sa.String(length=255), nullable=False),
    sa.Column('brand', sa.String(length=100), nullable=True),
    sa.Column('ingredients_raw_text', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('product_id')
    )
    op.create_index(op.f('ix_products_barcode'), 'products', ['barcode'], unique=True)

    op.create_table('product_nutrition_flags',
    sa.Column('product_id', sa.UUID(), nullable=False),
    sa.Column('rule_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.product_id'], ),
    sa.ForeignKeyConstraint(['rule_id'], ['nutrition_rules.rule_id'], ),
    sa.PrimaryKeyConstraint('product_id', 'rule_id')
    )
    op.create_table('scan_histories',
    sa.Column('scan_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('product_id', sa.UUID(), nullable=True),
    sa.Column('scan_date', sa.DateTime(), nullable=True),
    sa.Column('scan_method', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['product_id'], ['products.product_id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
    sa.PrimaryKeyConstraint('scan_id')
    )
    op.create_table('user_allergies',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('allergy_type_id', sa.UUID(), nullable=False),
    sa.Column('severity', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['allergy_type_id'], ['allergy_types.allergy_type_id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
    sa.PrimaryKeyConstraint('user_id', 'allergy_type_id')
    )
    op.create_table('user_health_conditions',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('condition_type_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['condition_type_id'], ['health_condition_types.condition_type_id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ),
    sa.PrimaryKeyConstraint('user_id', 'condition_type_id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    pass