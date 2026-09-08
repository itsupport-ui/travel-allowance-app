"""Add short-lived report snapshots.

Revision ID: 0010_report_snapshots
Revises: 0009_early_end_reason
Create Date: 2026-08-31 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_report_snapshots"
down_revision: Union[str, None] = "0009_early_end_reason"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "report_snapshots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("rows", sa.JSON(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
    )
    op.create_index(
        "ix_report_snapshots_requested_by",
        "report_snapshots",
        ["requested_by"],
    )
    op.create_index(
        "ix_report_snapshots_report_type",
        "report_snapshots",
        ["report_type"],
    )
    op.create_index(
        "ix_report_snapshots_expires_at",
        "report_snapshots",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_report_snapshots_expires_at", table_name="report_snapshots")
    op.drop_index("ix_report_snapshots_report_type", table_name="report_snapshots")
    op.drop_index("ix_report_snapshots_requested_by", table_name="report_snapshots")
    op.drop_table("report_snapshots")
