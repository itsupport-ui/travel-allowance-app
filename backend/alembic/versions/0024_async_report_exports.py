"""Allow durable queued report export jobs.

Revision ID: 0024_async_report_exports
Revises: 0023_doctor_expense_approval_policy
Create Date: 2026-09-03 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024_async_report_exports"
down_revision: Union[str, None] = "0023_doctor_expense_approval_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for column in (
        "filename", "mime_type", "size_bytes", "checksum_sha256",
        "artifact", "completed_at",
    ):
        op.alter_column("report_export_jobs", column, nullable=True)
    op.add_column(
        "report_export_jobs",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "report_export_jobs",
        sa.Column("error_code", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "report_export_jobs",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.execute("DELETE FROM report_export_jobs WHERE status <> 'completed'")
    op.drop_column("report_export_jobs", "started_at")
    op.drop_column("report_export_jobs", "error_code")
    op.drop_column("report_export_jobs", "attempt_count")
    for column in (
        "filename", "mime_type", "size_bytes", "checksum_sha256",
        "artifact", "completed_at",
    ):
        op.alter_column("report_export_jobs", column, nullable=False)
