"""Add places and doctor tasks.

Revision ID: 0029_doctor_tasks_places
Revises: 0028_schedule_provenance
Create Date: 2026-10-17 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0029_doctor_tasks_places"
down_revision: Union[str, None] = "0028_schedule_provenance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECK_NAME = "ck_location_exception_exactly_one_target"
OLD_CHECK = (
    "(schedule_id IS NOT NULL AND doctor_visit_id IS NULL) OR "
    "(schedule_id IS NULL AND doctor_visit_id IS NOT NULL)"
)
NEW_CHECK = (
    "(schedule_id IS NOT NULL AND doctor_visit_id IS NULL "
    "AND doctor_task_id IS NULL) OR "
    "(schedule_id IS NULL AND doctor_visit_id IS NOT NULL "
    "AND doctor_task_id IS NULL) OR "
    "(schedule_id IS NULL AND doctor_visit_id IS NULL "
    "AND doctor_task_id IS NOT NULL)"
)


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column(
            "place_type",
            sa.String(length=30),
            nullable=False,
            server_default="clinic",
        ),
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("radius_m", sa.Float(), nullable=True),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_places_id", "places", ["id"])

    op.create_table(
        "doctor_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "assigned_by",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "doctor_id",
            sa.Integer(),
            sa.ForeignKey("doctors.id"),
            nullable=False,
        ),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("place_id", sa.Integer(), sa.ForeignKey("places.id")),
        sa.Column(
            "doctor_visit_id",
            sa.Integer(),
            sa.ForeignKey("doctor_visits.id"),
            nullable=True,
            unique=True,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="assigned",
        ),
        sa.Column(
            "session_status",
            sa.String(length=20),
            nullable=False,
            server_default="NOT_STARTED",
        ),
        sa.Column("punch_in_time", sa.DateTime(timezone=True)),
        sa.Column("punch_out_time", sa.DateTime(timezone=True)),
        sa.Column("punch_in_latitude", sa.Float()),
        sa.Column("punch_in_longitude", sa.Float()),
        sa.Column("punch_out_latitude", sa.Float()),
        sa.Column("punch_out_longitude", sa.Float()),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("proof_file", sa.String()),
        sa.Column("completion_notes", sa.Text()),
        sa.Column("cancel_reason", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_doctor_tasks_id", "doctor_tasks", ["id"])
    op.create_index("ix_doctor_tasks_task_type", "doctor_tasks", ["task_type"])
    op.create_index("ix_doctor_tasks_doctor_id", "doctor_tasks", ["doctor_id"])
    op.create_index(
        "ix_doctor_tasks_scheduled_date",
        "doctor_tasks",
        ["scheduled_date"],
    )
    op.create_index("ix_doctor_tasks_status", "doctor_tasks", ["status"])

    with op.batch_alter_table("doctor_travel_waypoints") as batch:
        batch.add_column(sa.Column("task_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_doctor_waypoints_task_id",
            "doctor_tasks",
            ["task_id"],
            ["id"],
        )
        batch.create_index("ix_doctor_travel_waypoints_task_id", ["task_id"])

    with op.batch_alter_table("location_exception_requests") as batch:
        batch.add_column(
            sa.Column("doctor_task_id", sa.Integer(), nullable=True)
        )
        batch.create_foreign_key(
            "fk_location_exception_doctor_task_id",
            "doctor_tasks",
            ["doctor_task_id"],
            ["id"],
        )
        batch.create_index(
            "ix_location_exception_requests_doctor_task_id",
            ["doctor_task_id"],
        )
        batch.drop_constraint(CHECK_NAME, type_="check")
        batch.create_check_constraint(CHECK_NAME, NEW_CHECK)


def downgrade() -> None:
    # Task-targeted exceptions cannot satisfy the previous two-target check.
    op.execute(
        sa.text(
            "DELETE FROM location_exception_requests "
            "WHERE doctor_task_id IS NOT NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE doctor_travel_waypoints SET task_id = NULL "
            "WHERE task_id IS NOT NULL"
        )
    )
    with op.batch_alter_table("location_exception_requests") as batch:
        batch.drop_constraint(CHECK_NAME, type_="check")
        batch.create_check_constraint(CHECK_NAME, OLD_CHECK)
        batch.drop_index("ix_location_exception_requests_doctor_task_id")
        batch.drop_constraint(
            "fk_location_exception_doctor_task_id",
            type_="foreignkey",
        )
        batch.drop_column("doctor_task_id")

    with op.batch_alter_table("doctor_travel_waypoints") as batch:
        batch.drop_index("ix_doctor_travel_waypoints_task_id")
        batch.drop_constraint("fk_doctor_waypoints_task_id", type_="foreignkey")
        batch.drop_column("task_id")

    op.drop_table("doctor_tasks")
    op.drop_table("places")
