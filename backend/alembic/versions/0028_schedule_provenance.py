"""Record who created a treatment schedule and how.

Revision ID: 0028_schedule_provenance
Revises: 0027_consultation_updated_at_default
Create Date: 2026-10-16 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0028_schedule_provenance"
down_revision: Union[str, None] = "0027_consultation_updated_at_default"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "treatment_schedules",
        sa.Column("created_by_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("source", sa.String(), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("treatment_schedules") as batch:
        batch.drop_column("source")
        batch.drop_column("created_by_id")
