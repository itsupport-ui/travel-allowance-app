"""Add auditable early workday closure reasons.

Revision ID: 0009_early_end_reason
Revises: 0008_financial_policy
Create Date: 2026-08-31 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_early_end_reason"
down_revision: Union[str, None] = "0008_financial_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table_name in ("therapist_work_days", "doctor_work_days"):
        op.add_column(
            table_name,
            sa.Column(
                "ended_early",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
        op.add_column(
            table_name,
            sa.Column("end_reason", sa.String(), nullable=True),
        )


def downgrade() -> None:
    for table_name in ("doctor_work_days", "therapist_work_days"):
        op.drop_column(table_name, "end_reason")
        op.drop_column(table_name, "ended_early")
