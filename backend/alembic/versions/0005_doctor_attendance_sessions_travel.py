"""Add doctor attendance, visit sessions, and travel audit links.

Revision ID: 0005_doctor_attendance
Revises: 0004_sessions_workday_end
Create Date: 2026-07-28 00:00:00
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_doctor_attendance"
down_revision: Union[str, None] = "0004_sessions_workday_end"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "doctor_work_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("start_address", sa.String(), nullable=True),
        sa.Column("start_latitude", sa.Float(), nullable=False),
        sa.Column("start_longitude", sa.Float(), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_address", sa.String(), nullable=True),
        sa.Column("end_latitude", sa.Float(), nullable=True),
        sa.Column("end_longitude", sa.Float(), nullable=True),
        sa.Column("total_work_minutes", sa.Integer(), nullable=True),
        sa.Column("total_visits_count", sa.Integer(), nullable=True),
        sa.Column("completed_visits_count", sa.Integer(), nullable=True),
        sa.Column("pending_visits_count", sa.Integer(), nullable=True),
        sa.Column("total_distance_km", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "doctor_id",
            "work_date",
            name="uq_doctor_work_days_doctor_date",
        ),
    )
    op.create_index(
        "ix_doctor_work_days_id",
        "doctor_work_days",
        ["id"],
    )
    op.create_index(
        "ix_doctor_work_days_doctor_id",
        "doctor_work_days",
        ["doctor_id"],
    )
    op.create_index(
        "ix_doctor_work_days_work_date",
        "doctor_work_days",
        ["work_date"],
    )

    for column in (
        sa.Column("patient_latitude", sa.Float(), nullable=True),
        sa.Column("patient_longitude", sa.Float(), nullable=True),
        sa.Column(
            "punch_in_time",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "punch_out_time",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("punch_in_latitude", sa.Float(), nullable=True),
        sa.Column("punch_in_longitude", sa.Float(), nullable=True),
        sa.Column("punch_out_latitude", sa.Float(), nullable=True),
        sa.Column("punch_out_longitude", sa.Float(), nullable=True),
        sa.Column("treatment_duration", sa.Integer(), nullable=True),
        sa.Column(
            "session_status",
            sa.String(),
            server_default="NOT_STARTED",
            nullable=False,
        ),
    ):
        op.add_column("doctor_visits", column)
    op.create_index(
        "ix_doctor_visits_session_status",
        "doctor_visits",
        ["session_status"],
    )

    op.create_table(
        "doctor_travel_waypoints",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("workday_id", sa.Integer(), nullable=False),
        sa.Column("visit_id", sa.Integer(), nullable=True),
        sa.Column("waypoint_type", sa.String(), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "distance_from_previous_km",
            sa.Float(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["visit_id"], ["doctor_visits.id"]),
        sa.ForeignKeyConstraint(
            ["workday_id"],
            ["doctor_work_days.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workday_id",
            "sequence_number",
            name="uq_doctor_waypoints_workday_sequence",
        ),
        sa.UniqueConstraint(
            "workday_id",
            "visit_id",
            name="uq_doctor_waypoints_workday_visit",
        ),
    )
    op.create_index(
        "ix_doctor_travel_waypoints_id",
        "doctor_travel_waypoints",
        ["id"],
    )
    op.create_index(
        "ix_doctor_travel_waypoints_doctor_id",
        "doctor_travel_waypoints",
        ["doctor_id"],
    )
    op.create_index(
        "ix_doctor_travel_waypoints_workday_id",
        "doctor_travel_waypoints",
        ["workday_id"],
    )
    op.create_index(
        "ix_doctor_travel_waypoints_visit_id",
        "doctor_travel_waypoints",
        ["visit_id"],
    )

    expense_columns = (
        sa.Column("workday_id", sa.Integer(), nullable=True),
        sa.Column("visit_id", sa.Integer(), nullable=True),
        sa.Column("from_waypoint_id", sa.Integer(), nullable=True),
        sa.Column("to_waypoint_id", sa.Integer(), nullable=True),
        sa.Column("from_latitude", sa.Float(), nullable=True),
        sa.Column("from_longitude", sa.Float(), nullable=True),
        sa.Column("to_latitude", sa.Float(), nullable=True),
        sa.Column("to_longitude", sa.Float(), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=True),
    )
    for column in expense_columns:
        op.add_column("doctor_expenses", column)
    op.create_foreign_key(
        "fk_doctor_expenses_workday_id",
        "doctor_expenses",
        "doctor_work_days",
        ["workday_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_doctor_expenses_visit_id",
        "doctor_expenses",
        "doctor_visits",
        ["visit_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_doctor_expenses_from_waypoint_id",
        "doctor_expenses",
        "doctor_travel_waypoints",
        ["from_waypoint_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_doctor_expenses_to_waypoint_id",
        "doctor_expenses",
        "doctor_travel_waypoints",
        ["to_waypoint_id"],
        ["id"],
    )
    op.create_index(
        "ix_doctor_expenses_workday_id",
        "doctor_expenses",
        ["workday_id"],
    )
    op.create_index(
        "ix_doctor_expenses_visit_id",
        "doctor_expenses",
        ["visit_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_doctor_expenses_visit_id",
        table_name="doctor_expenses",
    )
    op.drop_index(
        "ix_doctor_expenses_workday_id",
        table_name="doctor_expenses",
    )
    op.drop_constraint(
        "fk_doctor_expenses_to_waypoint_id",
        "doctor_expenses",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_doctor_expenses_from_waypoint_id",
        "doctor_expenses",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_doctor_expenses_visit_id",
        "doctor_expenses",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_doctor_expenses_workday_id",
        "doctor_expenses",
        type_="foreignkey",
    )
    for column_name in (
        "distance_km",
        "to_longitude",
        "to_latitude",
        "from_longitude",
        "from_latitude",
        "to_waypoint_id",
        "from_waypoint_id",
        "visit_id",
        "workday_id",
    ):
        op.drop_column("doctor_expenses", column_name)

    op.drop_index(
        "ix_doctor_travel_waypoints_visit_id",
        table_name="doctor_travel_waypoints",
    )
    op.drop_index(
        "ix_doctor_travel_waypoints_workday_id",
        table_name="doctor_travel_waypoints",
    )
    op.drop_index(
        "ix_doctor_travel_waypoints_doctor_id",
        table_name="doctor_travel_waypoints",
    )
    op.drop_index(
        "ix_doctor_travel_waypoints_id",
        table_name="doctor_travel_waypoints",
    )
    op.drop_table("doctor_travel_waypoints")

    op.drop_index(
        "ix_doctor_visits_session_status",
        table_name="doctor_visits",
    )
    for column_name in (
        "session_status",
        "treatment_duration",
        "punch_out_longitude",
        "punch_out_latitude",
        "punch_in_longitude",
        "punch_in_latitude",
        "punch_out_time",
        "punch_in_time",
        "patient_longitude",
        "patient_latitude",
    ):
        op.drop_column("doctor_visits", column_name)

    op.drop_index(
        "ix_doctor_work_days_work_date",
        table_name="doctor_work_days",
    )
    op.drop_index(
        "ix_doctor_work_days_doctor_id",
        table_name="doctor_work_days",
    )
    op.drop_index(
        "ix_doctor_work_days_id",
        table_name="doctor_work_days",
    )
    op.drop_table("doctor_work_days")
