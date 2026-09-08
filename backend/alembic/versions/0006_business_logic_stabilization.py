"""Stabilize workdays and correction audit metadata.

Revision ID: 0006_business_logic
Revises: 0005_doctor_attendance
Create Date: 2026-08-30 00:00:00
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_business_logic"
down_revision: Union[str, None] = "0005_doctor_attendance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if not op.get_context().as_sql:
        duplicate_workdays = bind.execute(
            sa.text(
                """
                SELECT therapist_id, work_date, COUNT(*) AS duplicate_count
                FROM therapist_work_days
                GROUP BY therapist_id, work_date
                HAVING COUNT(*) > 1
                LIMIT 1
                """
            )
        ).first()
        if duplicate_workdays is not None:
            raise RuntimeError(
                "Duplicate therapist workdays must be resolved before applying "
                "the business-logic stabilization migration."
            )

    op.create_index(
        "uq_therapist_work_days_therapist_date",
        "therapist_work_days",
        ["therapist_id", "work_date"],
        unique=True,
    )

    if bind.dialect.name == "postgresql":
        op.alter_column(
            "claims",
            "patient_visited_today",
            existing_type=sa.String(),
            type_=sa.Boolean(),
            existing_nullable=True,
            postgresql_using=(
                "CASE WHEN lower(CAST(patient_visited_today AS text)) "
                "IN ('true', 't', '1', 'yes') THEN true ELSE false END"
            ),
        )
    else:
        with op.batch_alter_table("claims") as batch_op:
            batch_op.alter_column(
                "patient_visited_today",
                existing_type=sa.String(),
                type_=sa.Boolean(),
                existing_nullable=True,
            )

    op.add_column(
        "claims",
        sa.Column("rejection_reason", sa.String(), nullable=True),
    )
    op.add_column(
        "claims",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "claims",
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
    )
    op.add_column(
        "claims",
        sa.Column(
            "revision",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )

    op.add_column(
        "doctor_claims",
        sa.Column(
            "revision",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )

    op.add_column(
        "treatment_plans",
        sa.Column("rejection_reason", sa.String(), nullable=True),
    )
    op.add_column(
        "treatment_plans",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "treatment_plans",
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
    )
    op.add_column(
        "treatment_plans",
        sa.Column(
            "revision",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )

    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_claims_reviewed_by_users",
            "claims",
            "users",
            ["reviewed_by"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_treatment_plans_reviewed_by_users",
            "treatment_plans",
            "users",
            ["reviewed_by"],
            ["id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "fk_treatment_plans_reviewed_by_users",
            "treatment_plans",
            type_="foreignkey",
        )
        op.drop_constraint(
            "fk_claims_reviewed_by_users",
            "claims",
            type_="foreignkey",
        )

    op.drop_column("treatment_plans", "revision")
    op.drop_column("treatment_plans", "reviewed_by")
    op.drop_column("treatment_plans", "reviewed_at")
    op.drop_column("treatment_plans", "rejection_reason")
    op.drop_column("doctor_claims", "revision")
    op.drop_column("claims", "revision")
    op.drop_column("claims", "reviewed_by")
    op.drop_column("claims", "reviewed_at")
    op.drop_column("claims", "rejection_reason")
    if bind.dialect.name == "postgresql":
        op.alter_column(
            "claims",
            "patient_visited_today",
            existing_type=sa.Boolean(),
            type_=sa.String(),
            existing_nullable=True,
            postgresql_using="CAST(patient_visited_today AS text)",
        )
    else:
        with op.batch_alter_table("claims") as batch_op:
            batch_op.alter_column(
                "patient_visited_today",
                existing_type=sa.Boolean(),
                type_=sa.String(),
                existing_nullable=True,
            )
    op.drop_index(
        "uq_therapist_work_days_therapist_date",
        table_name="therapist_work_days",
    )
