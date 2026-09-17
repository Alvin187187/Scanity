"""remove local user password

Revision ID: da67baeaba01
Revises: ea1c0b057c6b
Create Date: 2026-09-10

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "da67baeaba01"
down_revision: Union[str, Sequence[str], None] = "ea1c0b057c6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove the local password column.

    Authentication passwords are handled by Supabase Auth.
    """
    op.drop_column("users", "password")


def downgrade() -> None:
    """Restore the previous local password column if rolled back."""
    op.add_column(
        "users",
        sa.Column("password", sa.String(length=255), nullable=True),
    )
