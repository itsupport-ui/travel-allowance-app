"""Add treatment sessions and workday closure.

Revision ID: 0004_sessions_workday_end
Revises: 0003_schedule_metadata
Create Date: 2026-07-28 00:00:00
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_sessions_workday_end"
down_revision: Union[str, None] = "0003_schedule_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "treatment_schedules",
        sa.Column("punch_in_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("punch_out_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("punch_in_latitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("punch_in_longitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("punch_out_latitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("punch_out_longitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("treatment_duration", sa.Integer(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column(
            "session_status",
            sa.String(),
            server_default="NOT_STARTED",
            nullable=False,
        ),
    )
    op.create_index(
        "ix_treatment_schedules_session_status",
        "treatment_schedules",
        ["session_status"],
        unique=False,
    )

    op.add_column(
        "therapist_work_days",
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "therapist_work_days",
        sa.Column("end_latitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "therapist_work_days",
        sa.Column("end_longitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "therapist_work_days",
        sa.Column("total_work_minutes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "therapist_work_days",
        sa.Column("pending_schedules_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "therapist_work_days",
        sa.Column("completed_schedules_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "therapist_work_days",
        sa.Column("missed_schedules_count", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("therapist_work_days", "missed_schedules_count")
    op.drop_column("therapist_work_days", "completed_schedules_count")
    op.drop_column("therapist_work_days", "pending_schedules_count")
    op.drop_column("therapist_work_days", "total_work_minutes")
    op.drop_column("therapist_work_days", "end_longitude")
    op.drop_column("therapist_work_days", "end_latitude")
    op.drop_column("therapist_work_days", "ended_at")

    op.drop_index(
        "ix_treatment_schedules_session_status",
        table_name="treatment_schedules",
    )
    op.drop_column("treatment_schedules", "session_status")
    op.drop_column("treatment_schedules", "treatment_duration")
    op.drop_column("treatment_schedules", "punch_out_longitude")
    op.drop_column("treatment_schedules", "punch_out_latitude")
    op.drop_column("treatment_schedules", "punch_in_longitude")
    op.drop_column("treatment_schedules", "punch_in_latitude")
    op.drop_column("treatment_schedules", "punch_out_time")
    op.drop_column("treatment_schedules", "punch_in_time")
