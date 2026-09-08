"""Add report summary metadata for non-financial report families.

Revision ID: 0013_report_snapshot_summaries
Revises: 0012_report_export_jobs
Create Date: 2026-08-31 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_report_snapshot_summaries"
down_revision: Union[str, None] = "0012_report_export_jobs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table_name in (
        "report_snapshots",
        "report_export_audits",
        "report_export_jobs",
    ):
        op.add_column(
            table_name,
            sa.Column(
                "summary",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{}'"),
            ),
        )


def downgrade() -> None:
    for table_name in (
        "report_export_jobs",
        "report_export_audits",
        "report_snapshots",
    ):
        op.drop_column(table_name, "summary")
