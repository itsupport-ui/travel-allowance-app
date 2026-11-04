"""Add freelance therapists and link-based freelance visits.

Revision ID: 0031_freelance_visits
Revises: 0030_doctor_expense_task_link
Create Date: 2026-11-04 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0031_freelance_visits"
down_revision: Union[str, None] = "0030_doctor_expense_task_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_freelance_therapists() -> None:
    op.create_table(
        "freelance_therapists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("phone", sa.String(length=15), nullable=False),
        sa.Column("upi_id", sa.String(length=100), nullable=True),
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
    op.create_index("ix_freelance_therapists_id", "freelance_therapists", ["id"])
    op.create_index(
        "ix_freelance_therapists_phone",
        "freelance_therapists",
        ["phone"],
        unique=True,
    )


def _create_freelance_visits() -> None:
    op.create_table(
        "freelance_visits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "freelancer_id",
            sa.Integer(),
            sa.ForeignKey("freelance_therapists.id"),
            nullable=False,
        ),
        sa.Column("patient_name", sa.String(length=150), nullable=False),
        sa.Column("patient_phone", sa.String(length=20), nullable=True),
        sa.Column("patient_address", sa.String(), nullable=False),
        sa.Column("patient_latitude", sa.Float(), nullable=True),
        sa.Column("patient_longitude", sa.Float(), nullable=True),
        sa.Column("treatment_name", sa.String(length=200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("doctors.id")),
        sa.Column(
            "treatment_plan_id",
            sa.Integer(),
            sa.ForeignKey("treatment_plans.id"),
        ),
        sa.Column("fee_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="assigned",
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "token_expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("punch_in_time", sa.DateTime(timezone=True)),
        sa.Column("punch_in_latitude", sa.Float()),
        sa.Column("punch_in_longitude", sa.Float()),
        sa.Column("punch_in_accuracy_m", sa.Float()),
        sa.Column("punch_out_time", sa.DateTime(timezone=True)),
        sa.Column("punch_out_latitude", sa.Float()),
        sa.Column("punch_out_longitude", sa.Float()),
        sa.Column("punch_out_accuracy_m", sa.Float()),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column(
            "location_unverified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("unverified_reason", sa.Text()),
        sa.Column("proof_file", sa.String()),
        sa.Column("completion_notes", sa.Text()),
        sa.Column("cancel_reason", sa.Text()),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("paid_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("payment_reference", sa.String(length=100)),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_freelance_visits_id", "freelance_visits", ["id"])
    op.create_index(
        "ix_freelance_visits_freelancer_id",
        "freelance_visits",
        ["freelancer_id"],
    )
    op.create_index(
        "ix_freelance_visits_visit_date",
        "freelance_visits",
        ["visit_date"],
    )
    op.create_index("ix_freelance_visits_status", "freelance_visits", ["status"])
    op.create_index(
        "ix_freelance_visits_token_hash",
        "freelance_visits",
        ["token_hash"],
        unique=True,
    )


def upgrade() -> None:
    # Deployments that ran with AUTO_CREATE_SCHEMA already have these tables.
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "freelance_therapists" not in existing:
        _create_freelance_therapists()
    if "freelance_visits" not in existing:
        _create_freelance_visits()


def downgrade() -> None:
    op.drop_table("freelance_visits")
    op.drop_table("freelance_therapists")
