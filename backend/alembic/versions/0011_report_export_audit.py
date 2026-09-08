"""Add persistent report export audit history.

Revision ID: 0011_report_export_audit
Revises: 0010_report_snapshots
Create Date: 2026-08-31 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_report_export_audit"
down_revision: Union[str, None] = "0010_report_snapshots"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "report_export_audits",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("format", sa.String(), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "snapshot_expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("download_count", sa.Integer(), nullable=False),
        sa.Column(
            "first_generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_downloaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.UniqueConstraint(
            "snapshot_id",
            "requested_by",
            "format",
            name="uq_report_export_audit_snapshot_requester_format",
        ),
    )
    op.create_index(
        "ix_report_export_audits_snapshot_id",
        "report_export_audits",
        ["snapshot_id"],
    )
    op.create_index(
        "ix_report_export_audits_requested_by",
        "report_export_audits",
        ["requested_by"],
    )
    op.create_index(
        "ix_report_export_audits_report_type",
        "report_export_audits",
        ["report_type"],
    )
    op.create_index(
        "ix_report_export_audits_scope",
        "report_export_audits",
        ["scope"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_report_export_audits_scope",
        table_name="report_export_audits",
    )
    op.drop_index(
        "ix_report_export_audits_report_type",
        table_name="report_export_audits",
    )
    op.drop_index(
        "ix_report_export_audits_requested_by",
        table_name="report_export_audits",
    )
    op.drop_index(
        "ix_report_export_audits_snapshot_id",
        table_name="report_export_audits",
    )
    op.drop_table("report_export_audits")
