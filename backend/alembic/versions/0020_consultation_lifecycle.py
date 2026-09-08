"""Add recoverable doctor consultation lifecycle and audit events.

Revision ID: 0020_consultation_lifecycle
Revises: 0019_manual_doctor_expense_review
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020_consultation_lifecycle"
down_revision: Union[str, None] = "0019_manual_doctor_expense_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = (
        sa.Column("origin_consultation_id", sa.Integer(), nullable=True),
        sa.Column("successor_consultation_id", sa.Integer(), nullable=True),
        sa.Column("origin_kind", sa.String(), nullable=True),
        sa.Column("follow_up_date", sa.Date(), nullable=True),
        sa.Column("follow_up_time", sa.Time(), nullable=True),
        sa.Column("follow_up_reason", sa.Text(), nullable=True),
        sa.Column("cancellation_code", sa.String(), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("cancelled_by", sa.Integer(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "lifecycle_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )
    for column in columns:
        op.add_column("doctor_consultations", column)

    op.execute(
        sa.text(
            "UPDATE doctor_consultations SET updated_at = "
            "COALESCE(completed_at, created_at, CURRENT_TIMESTAMP) "
            "WHERE updated_at IS NULL"
        )
    )
    if bind.dialect.name != "sqlite":
        op.alter_column(
            "doctor_consultations",
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
            existing_server_default=sa.func.now(),
        )
    op.create_index(
        "ix_doctor_consultations_origin_consultation_id",
        "doctor_consultations",
        ["origin_consultation_id"],
        unique=True,
    )
    op.create_index(
        "ix_doctor_consultations_successor_consultation_id",
        "doctor_consultations",
        ["successor_consultation_id"],
        unique=True,
    )
    op.create_index(
        "ix_doctor_consultations_follow_up_date",
        "doctor_consultations",
        ["follow_up_date"],
    )
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_doctor_consultations_origin",
            "doctor_consultations",
            "doctor_consultations",
            ["origin_consultation_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_doctor_consultations_successor",
            "doctor_consultations",
            "doctor_consultations",
            ["successor_consultation_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_doctor_consultations_cancelled_by",
            "doctor_consultations",
            "users",
            ["cancelled_by"],
            ["id"],
        )

    op.create_table(
        "doctor_consultation_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("consultation_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(), nullable=True),
        sa.Column("to_status", sa.String(), nullable=True),
        sa.Column("from_decision", sa.String(), nullable=True),
        sa.Column("to_decision", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("related_consultation_id", sa.Integer(), nullable=True),
        sa.Column("related_visit_id", sa.Integer(), nullable=True),
        sa.Column("lifecycle_version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["consultation_id"], ["doctor_consultations.id"]),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["related_consultation_id"], ["doctor_consultations.id"]
        ),
        sa.ForeignKeyConstraint(["related_visit_id"], ["doctor_visits.id"]),
    )
    op.create_index(
        "ix_doctor_consultation_events_consultation_id",
        "doctor_consultation_events",
        ["consultation_id"],
    )
    op.create_index(
        "ix_doctor_consultation_events_event_type",
        "doctor_consultation_events",
        ["event_type"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index(
        "ix_doctor_consultation_events_event_type",
        table_name="doctor_consultation_events",
    )
    op.drop_index(
        "ix_doctor_consultation_events_consultation_id",
        table_name="doctor_consultation_events",
    )
    op.drop_table("doctor_consultation_events")
    if bind.dialect.name != "sqlite":
        op.alter_column(
            "doctor_consultations",
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=True,
        )
        for constraint in (
            "fk_doctor_consultations_cancelled_by",
            "fk_doctor_consultations_successor",
            "fk_doctor_consultations_origin",
        ):
            op.drop_constraint(
                constraint,
                "doctor_consultations",
                type_="foreignkey",
            )
    op.drop_index(
        "ix_doctor_consultations_follow_up_date",
        table_name="doctor_consultations",
    )
    op.drop_index(
        "ix_doctor_consultations_successor_consultation_id",
        table_name="doctor_consultations",
    )
    op.drop_index(
        "ix_doctor_consultations_origin_consultation_id",
        table_name="doctor_consultations",
    )
    for column_name in (
        "updated_at",
        "lifecycle_version",
        "cancelled_at",
        "cancelled_by",
        "cancellation_reason",
        "cancellation_code",
        "follow_up_reason",
        "follow_up_time",
        "follow_up_date",
        "origin_kind",
        "successor_consultation_id",
        "origin_consultation_id",
    ):
        op.drop_column("doctor_consultations", column_name)
