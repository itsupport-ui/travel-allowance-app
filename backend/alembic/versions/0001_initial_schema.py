"""Initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-07-06 00:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    visit_status = postgresql.ENUM(
        "scheduled",
        "visited",
        "treatment_plan_submitted",
        "cancelled",
        name="visit_status",
    )
    doctor_consultation_patient_decision = postgresql.ENUM(
        "pending",
        "confirmed",
        "rejected",
        "follow_up",
        name="doctor_consultation_patient_decision",
    )
    doctor_consultation_status = postgresql.ENUM(
        "scheduled",
        "completed",
        "cancelled",
        name="doctor_consultation_status",
    )
    treatment_plan_status = postgresql.ENUM(
        "pending",
        "submitted",
        "approved",
        "rejected",
        name="treatment_plan_status",
    )

    visit_status.create(op.get_bind(), checkfirst=True)
    doctor_consultation_patient_decision.create(op.get_bind(), checkfirst=True)
    doctor_consultation_status.create(op.get_bind(), checkfirst=True)
    treatment_plan_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("per_km_rate", sa.Float(), nullable=True),
        sa.Column("daily_allowance", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_settings_id", "settings", ["id"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("base_location", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index(
        "uq_users_username_lower",
        "users",
        [sa.text("lower(username)")],
        unique=True,
    )

    op.create_table(
        "doctors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("specialization", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_doctors_id", "doctors", ["id"], unique=False)
    op.create_index("ix_doctors_user_id", "doctors", ["user_id"], unique=True)

    op.create_table(
        "doctor_claims",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("claim_date", sa.Date(), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("expense_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("rejection_reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("doctor_id", "claim_date", name="uq_doctor_claims_doctor_date"),
    )
    op.create_index("ix_doctor_claims_claim_date", "doctor_claims", ["claim_date"], unique=False)
    op.create_index("ix_doctor_claims_doctor_id", "doctor_claims", ["doctor_id"], unique=False)
    op.create_index("ix_doctor_claims_id", "doctor_claims", ["id"], unique=False)
    op.create_index("ix_doctor_claims_status", "doctor_claims", ["status"], unique=False)

    op.create_table(
        "doctor_visits",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("patient_name", sa.String(length=255), nullable=False),
        sa.Column("patient_phone", sa.String(length=20), nullable=False),
        sa.Column("patient_address", sa.String(length=255), nullable=True),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("visit_time", sa.Time(), nullable=False),
        sa.Column("chief_complaint", sa.Text(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("status", visit_status, nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("installation_id", sa.String(length=64), nullable=False),
        sa.Column("expo_push_token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_push_tokens_expo_push_token", "push_tokens", ["expo_push_token"], unique=True)
    op.create_index("ix_push_tokens_id", "push_tokens", ["id"], unique=False)
    op.create_index("ix_push_tokens_installation_id", "push_tokens", ["installation_id"], unique=True)
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"], unique=False)

    op.create_table(
        "therapist_work_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("therapist_id", sa.Integer(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("start_address", sa.String(), nullable=True),
        sa.Column("start_latitude", sa.Float(), nullable=True),
        sa.Column("start_longitude", sa.Float(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(["therapist_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_therapist_work_days_id", "therapist_work_days", ["id"], unique=False)

    op.create_table(
        "treatment_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doctor_visit_id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("patient_name", sa.String(), nullable=False),
        sa.Column("diagnosis", sa.String(), nullable=True),
        sa.Column("chief_complaint", sa.String(), nullable=True),
        sa.Column("treatment_plan", sa.String(), nullable=True),
        sa.Column("medicines", sa.String(), nullable=True),
        sa.Column("sessions_required", sa.Integer(), nullable=True),
        sa.Column("frequency", sa.String(), nullable=True),
        sa.Column("duration", sa.String(), nullable=True),
        sa.Column("special_instructions", sa.String(), nullable=True),
        sa.Column("remarks", sa.String(), nullable=True),
        sa.Column("status", treatment_plan_status, nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["doctor_visit_id"], ["doctor_visits.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_treatment_plans_id", "treatment_plans", ["id"], unique=False)

    op.create_table(
        "treatment_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_name", sa.String(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("therapist_id", sa.Integer(), nullable=False),
        sa.Column("treatment_name", sa.String(), nullable=False),
        sa.Column("medicines", sa.String(), nullable=True),
        sa.Column("patient_address", sa.String(), nullable=False),
        sa.Column("patient_latitude", sa.Float(), nullable=True),
        sa.Column("patient_longitude", sa.Float(), nullable=True),
        sa.Column("schedule_type", sa.String(), nullable=False),
        sa.Column("treatment_date", sa.Date(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("in_time", sa.Time(), nullable=True),
        sa.Column("out_time", sa.Time(), nullable=True),
        sa.Column("instructions", sa.String(), nullable=True),
        sa.Column("priority", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completion_notes", sa.String(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("missed_reason", sa.String(), nullable=True),
        sa.Column("transport_mode", sa.String(), nullable=False),
        sa.Column("treatment_plan_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["therapist_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["treatment_plan_id"], ["treatment_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_treatment_schedules_id", "treatment_schedules", ["id"], unique=False)
    op.create_index("ix_treatment_schedules_treatment_plan_id", "treatment_schedules", ["treatment_plan_id"], unique=False)

    op.create_table(
        "claims",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("therapist_id", sa.Integer(), nullable=False),
        sa.Column("claim_date", sa.Date(), nullable=False),
        sa.Column("total_km", sa.Float(), nullable=True),
        sa.Column("travel_total", sa.Float(), nullable=True),
        sa.Column("daily_allowance", sa.Float(), nullable=True),
        sa.Column("grand_total", sa.Float(), nullable=True),
        sa.Column("patient_visited_today", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("remarks", sa.String(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("per_km_rate", sa.Float(), nullable=True),
        sa.Column("schedule_id", sa.Integer(), nullable=True),
        sa.Column("from_address", sa.String(), nullable=True),
        sa.Column("to_address", sa.String(), nullable=True),
        sa.Column("auto_generated", sa.Boolean(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("distance_source", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["schedule_id"], ["treatment_schedules.id"]),
        sa.ForeignKeyConstraint(["therapist_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_claims_id", "claims", ["id"], unique=False)

    op.create_table(
        "doctor_consultations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_name", sa.String(), nullable=False),
        sa.Column("patient_phone", sa.String(), nullable=False),
        sa.Column("patient_address", sa.String(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("doctor_visit_id", sa.Integer(), nullable=True),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("scheduled_time", sa.Time(), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("call_outcome", sa.String(), nullable=True),
        sa.Column("preliminary_diagnosis", sa.Text(), nullable=True),
        sa.Column("proposed_treatment", sa.Text(), nullable=True),
        sa.Column("estimated_amount", sa.Float(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column(
            "patient_decision",
            doctor_consultation_patient_decision,
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            doctor_consultation_status,
            server_default=sa.text("'scheduled'"),
            nullable=False,
        ),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.ForeignKeyConstraint(["doctor_visit_id"], ["doctor_visits.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("doctor_visit_id"),
    )
    op.create_index("ix_doctor_consultations_doctor_id", "doctor_consultations", ["doctor_id"], unique=False)
    op.create_index("ix_doctor_consultations_doctor_visit_id", "doctor_consultations", ["doctor_visit_id"], unique=True)
    op.create_index("ix_doctor_consultations_id", "doctor_consultations", ["id"], unique=False)
    op.create_index("ix_doctor_consultations_scheduled_date", "doctor_consultations", ["scheduled_date"], unique=False)
    op.create_index("ix_doctor_consultations_status", "doctor_consultations", ["status"], unique=False)

    op.create_table(
        "doctor_expenses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("from_location", sa.String(), nullable=False),
        sa.Column("to_location", sa.String(), nullable=False),
        sa.Column("transport_mode", sa.String(), nullable=False),
        sa.Column("fare", sa.Float(), nullable=False),
        sa.Column("proof_file", sa.String(), nullable=True),
        sa.Column("remarks", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("claim_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["claim_id"], ["doctor_claims.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_doctor_expenses_claim_id", "doctor_expenses", ["claim_id"], unique=False)
    op.create_index("ix_doctor_expenses_doctor_id", "doctor_expenses", ["doctor_id"], unique=False)
    op.create_index("ix_doctor_expenses_expense_date", "doctor_expenses", ["expense_date"], unique=False)
    op.create_index("ix_doctor_expenses_id", "doctor_expenses", ["id"], unique=False)

    op.create_table(
        "travel_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("therapist_id", sa.Integer(), nullable=False),
        sa.Column("claim_id", sa.Integer(), nullable=True),
        sa.Column("travel_date", sa.DateTime(), nullable=False),
        sa.Column("from_address", sa.String(), nullable=False),
        sa.Column("to_address", sa.String(), nullable=False),
        sa.Column("total_km", sa.Float(), nullable=False),
        sa.Column("per_km_rate", sa.Float(), nullable=False),
        sa.Column("travel_fare", sa.Float(), nullable=False),
        sa.Column("patient_visited", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("patient_name", sa.String(), nullable=True),
        sa.Column("transport_mode", sa.String(), nullable=False),
        sa.Column("bill_amount", sa.Float(), nullable=True),
        sa.Column("invoice_file", sa.String(), nullable=True),
        sa.Column("schedule_id", sa.Integer(), nullable=True),
        sa.Column("arrival_latitude", sa.Float(), nullable=True),
        sa.Column("arrival_longitude", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"]),
        sa.ForeignKeyConstraint(["schedule_id"], ["treatment_schedules.id"]),
        sa.ForeignKeyConstraint(["therapist_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("therapist_id", "schedule_id", name="uq_travel_entries_therapist_schedule"),
    )
    op.create_index("ix_travel_entries_id", "travel_entries", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_travel_entries_id", table_name="travel_entries")
    op.drop_table("travel_entries")

    op.drop_index("ix_doctor_expenses_id", table_name="doctor_expenses")
    op.drop_index("ix_doctor_expenses_expense_date", table_name="doctor_expenses")
    op.drop_index("ix_doctor_expenses_doctor_id", table_name="doctor_expenses")
    op.drop_index("ix_doctor_expenses_claim_id", table_name="doctor_expenses")
    op.drop_table("doctor_expenses")

    op.drop_index("ix_doctor_consultations_status", table_name="doctor_consultations")
    op.drop_index("ix_doctor_consultations_scheduled_date", table_name="doctor_consultations")
    op.drop_index("ix_doctor_consultations_id", table_name="doctor_consultations")
    op.drop_index("ix_doctor_consultations_doctor_visit_id", table_name="doctor_consultations")
    op.drop_index("ix_doctor_consultations_doctor_id", table_name="doctor_consultations")
    op.drop_table("doctor_consultations")

    op.drop_index("ix_claims_id", table_name="claims")
    op.drop_table("claims")

    op.drop_index("ix_treatment_schedules_treatment_plan_id", table_name="treatment_schedules")
    op.drop_index("ix_treatment_schedules_id", table_name="treatment_schedules")
    op.drop_table("treatment_schedules")

    op.drop_index("ix_treatment_plans_id", table_name="treatment_plans")
    op.drop_table("treatment_plans")

    op.drop_index("ix_therapist_work_days_id", table_name="therapist_work_days")
    op.drop_table("therapist_work_days")

    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_index("ix_push_tokens_installation_id", table_name="push_tokens")
    op.drop_index("ix_push_tokens_id", table_name="push_tokens")
    op.drop_index("ix_push_tokens_expo_push_token", table_name="push_tokens")
    op.drop_table("push_tokens")

    op.drop_table("doctor_visits")

    op.drop_index("ix_doctor_claims_status", table_name="doctor_claims")
    op.drop_index("ix_doctor_claims_id", table_name="doctor_claims")
    op.drop_index("ix_doctor_claims_doctor_id", table_name="doctor_claims")
    op.drop_index("ix_doctor_claims_claim_date", table_name="doctor_claims")
    op.drop_table("doctor_claims")

    op.drop_index("ix_doctors_user_id", table_name="doctors")
    op.drop_index("ix_doctors_id", table_name="doctors")
    op.drop_table("doctors")

    op.drop_index("uq_users_username_lower", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_settings_id", table_name="settings")
    op.drop_table("settings")

    postgresql.ENUM(name="treatment_plan_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="doctor_consultation_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="doctor_consultation_patient_decision").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="visit_status").drop(op.get_bind(), checkfirst=True)
