"""widen users email and full_name

Revision ID: b7e1c4a92d10
Revises: c4f2a8d91e07
Create Date: 2026-09-22

Registration failed when an email longer than 35 characters, or a name
longer than 25 characters, was written to the local users table.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e1c4a92d10"
down_revision: Union[str, Sequence[str], None] = "c4f2a8d91e07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(35), type_=sa.String(255))
    op.alter_column("users", "full_name", existing_type=sa.String(25), type_=sa.String(120))


def downgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(255), type_=sa.String(35))
    op.alter_column("users", "full_name", existing_type=sa.String(120), type_=sa.String(25))
