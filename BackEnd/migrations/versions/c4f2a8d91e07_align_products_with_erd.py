"""align products table with the ERD model

Revision ID: c4f2a8d91e07
Revises: da67baeaba01
Create Date: 2026-09-13

Adds the barcode unique index and ingredients_raw_text used by barcode cache.
The live tables remain the ERD names: products, ingredients, scan_histories.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f2a8d91e07"
down_revision: Union[str, Sequence[str], None] = "da67baeaba01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("ingredients_raw_text", sa.Text(), nullable=True))
    op.create_index("ix_products_barcode", "products", ["barcode"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_products_barcode", table_name="products")
    op.drop_column("products", "ingredients_raw_text")
