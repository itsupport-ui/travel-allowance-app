"""Add the missing consultation updated-at server default.

Revision ID: 0027_consultation_updated_at_default
Revises: 0026_operational_follow_ups
Create Date: 2026-09-07 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027_consultation_updated_at_default"
down_revision: Union[str, None] = "0026_operational_follow_ups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE doctor_consultations "
            "SET updated_at = COALESCE(completed_at, created_at, CURRENT_TIMESTAMP) "
            "WHERE updated_at IS NULL"
        )
    )
    if op.get_bind().dialect.name != "sqlite":
        op.alter_column(
            "doctor_consultations",
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "sqlite":
        op.alter_column(
            "doctor_consultations",
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
            server_default=None,
        )
