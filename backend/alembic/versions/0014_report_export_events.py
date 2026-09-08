"""Add privacy-safe report export lifecycle events.

Revision ID: 0014_report_export_events
Revises: 0013_report_snapshot_summaries
Create Date: 2026-08-31 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_report_export_events"
down_revision: Union[str, None] = "0013_report_snapshot_summaries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "report_export_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=True),
        sa.Column("export_job_id", sa.String(length=36), nullable=True),
        sa.Column("report_type", sa.String(), nullable=True),
        sa.Column("scope", sa.String(), nullable=True),
        sa.Column("format", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column_name in (
        "requested_by",
        "snapshot_id",
        "export_job_id",
        "report_type",
        "scope",
        "event_type",
        "outcome",
        "error_code",
        "occurred_at",
    ):
        op.create_index(
            f"ix_report_export_events_{column_name}",
            "report_export_events",
            [column_name],
        )


def downgrade() -> None:
    op.drop_table("report_export_events")
