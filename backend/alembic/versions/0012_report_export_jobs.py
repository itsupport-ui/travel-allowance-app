"""Add retained synchronous report export jobs.

Revision ID: 0012_report_export_jobs
Revises: 0011_report_export_audit
Create Date: 2026-08-31 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_report_export_jobs"
down_revision: Union[str, None] = "0011_report_export_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "report_export_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("format", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("artifact", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["snapshot_id"], ["report_snapshots.id"]),
        sa.UniqueConstraint(
            "requested_by",
            "idempotency_key",
            name="uq_report_export_job_requester_idempotency",
        ),
    )
    for column in ("snapshot_id", "requested_by", "status", "expires_at"):
        op.create_index(
            f"ix_report_export_jobs_{column}",
            "report_export_jobs",
            [column],
        )


def downgrade() -> None:
    for column in ("expires_at", "status", "requested_by", "snapshot_id"):
        op.drop_index(
            f"ix_report_export_jobs_{column}",
            table_name="report_export_jobs",
        )
    op.drop_table("report_export_jobs")
