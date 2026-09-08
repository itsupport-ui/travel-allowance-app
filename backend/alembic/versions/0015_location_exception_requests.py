"""Add single-use location exception requests.

Revision ID: 0015_location_exceptions
Revises: 0014_report_export_events
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0015_location_exceptions"
down_revision: Union[str, None] = "0014_report_export_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "location_exception_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("staff_role", sa.String(length=20), nullable=False),
        sa.Column("schedule_id", sa.Integer(), nullable=True),
        sa.Column("doctor_visit_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("captured_latitude", sa.Float(), nullable=False),
        sa.Column("captured_longitude", sa.Float(), nullable=False),
        sa.Column("gps_accuracy_m", sa.Float(), nullable=False),
        sa.Column("device_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("geofence_radius_m", sa.Float(), nullable=False),
        sa.Column("evidence_quality", sa.String(length=20), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("active_key", sa.String(length=160), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint(
            "(schedule_id IS NOT NULL AND doctor_visit_id IS NULL) OR "
            "(schedule_id IS NULL AND doctor_visit_id IS NOT NULL)",
            name="ck_location_exception_exactly_one_target",
        ),
        sa.ForeignKeyConstraint(["doctor_visit_id"], ["doctor_visits.id"]),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["schedule_id"], ["treatment_schedules.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "active_key",
            name="uq_location_exception_active_key",
        ),
    )
    for column_name in (
        "requested_by",
        "staff_role",
        "schedule_id",
        "doctor_visit_id",
        "action",
        "business_date",
        "status",
        "reviewed_by",
        "requested_at",
    ):
        op.create_index(
            f"ix_location_exception_requests_{column_name}",
            "location_exception_requests",
            [column_name],
        )


def downgrade() -> None:
    op.drop_table("location_exception_requests")
