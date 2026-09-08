"""Add categorized review lifecycle for manual doctor expenses.

Revision ID: 0019_manual_doctor_expense_review
Revises: 0018_manual_travel_review
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0019_manual_doctor_expense_review"
down_revision: Union[str, None] = "0018_manual_travel_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
ALEMBIC_VERSION_CAPACITY = 128


def upgrade() -> None:
    bind = op.get_bind()
    # Alembic creates its version table as VARCHAR(32) by default. This revision
    # identifier (and later descriptive identifiers) is longer than 32
    # characters, so PostgreSQL would otherwise roll back while recording the
    # successful migration. Widen the bookkeeping column inside this migration
    # before Alembic advances version_num.
    if bind.dialect.name == "postgresql":
        op.alter_column(
            "alembic_version",
            "version_num",
            existing_type=sa.String(length=32),
            type_=sa.String(length=ALEMBIC_VERSION_CAPACITY),
            existing_nullable=False,
        )
    columns = (
        sa.Column(
            "expense_category",
            sa.String(),
            nullable=False,
            server_default="public_transport",
        ),
        sa.Column("manual_reason", sa.Text(), nullable=True),
        sa.Column("manual_review_status", sa.String(), nullable=True),
        sa.Column("manual_reviewed_by", sa.Integer(), nullable=True),
        sa.Column("manual_review_reason", sa.Text(), nullable=True),
        sa.Column("manual_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("manual_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "manual_review_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column("policy_id", sa.Integer(), nullable=True),
        sa.Column("rate_applied", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "calculation_version",
            sa.String(),
            nullable=False,
            server_default="decimal-v1",
        ),
        sa.Column(
            "rounding_mode",
            sa.String(),
            nullable=False,
            server_default="ROUND_HALF_UP",
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    for column in columns:
        op.add_column("doctor_expenses", column)

    op.execute(
        sa.text(
            "UPDATE doctor_expenses SET updated_at = CURRENT_TIMESTAMP "
            "WHERE updated_at IS NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE doctor_expenses SET "
            "expense_category = CASE "
            "WHEN visit_id IS NULL THEN 'authorized_other' "
            "ELSE 'public_transport' END, "
            "manual_reason = CASE WHEN visit_id IS NULL "
            "THEN 'Legacy manual expense; reason was not captured' "
            "ELSE NULL END, "
            "manual_review_status = CASE WHEN visit_id IS NULL THEN "
            "CASE WHEN claim_id IS NOT NULL OR status <> 'draft' "
            "THEN 'approved' ELSE 'pending' END ELSE NULL END"
        )
    )
    op.create_index(
        "ix_doctor_expenses_manual_review_status",
        "doctor_expenses",
        ["manual_review_status"],
    )
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_doctor_expenses_manual_reviewed_by",
            "doctor_expenses",
            "users",
            ["manual_reviewed_by"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_doctor_expenses_policy_id",
            "doctor_expenses",
            "reimbursement_policies",
            ["policy_id"],
            ["id"],
        )

    op.create_table(
        "manual_doctor_expense_review_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("expense_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(), nullable=True),
        sa.Column("to_status", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["expense_id"], ["doctor_expenses.id"]),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
    )
    op.create_index(
        "ix_manual_doctor_expense_review_events_expense_id",
        "manual_doctor_expense_review_events",
        ["expense_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_table("manual_doctor_expense_review_events")
    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "fk_doctor_expenses_policy_id",
            "doctor_expenses",
            type_="foreignkey",
        )
        op.drop_constraint(
            "fk_doctor_expenses_manual_reviewed_by",
            "doctor_expenses",
            type_="foreignkey",
        )
    op.drop_index(
        "ix_doctor_expenses_manual_review_status",
        table_name="doctor_expenses",
    )
    for column_name in (
        "updated_at",
        "rounding_mode",
        "calculation_version",
        "rate_applied",
        "policy_id",
        "manual_review_version",
        "manual_revision",
        "manual_reviewed_at",
        "manual_review_reason",
        "manual_reviewed_by",
        "manual_review_status",
        "manual_reason",
        "expense_category",
    ):
        op.drop_column("doctor_expenses", column_name)
