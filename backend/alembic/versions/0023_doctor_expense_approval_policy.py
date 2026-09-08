"""Add doctor expense receipt and approval policy snapshots.

Revision ID: 0023_doctor_expense_approval_policy
Revises: 0022_staff_deactivation_overrides
Create Date: 2026-09-03 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0023_doctor_expense_approval_policy"
down_revision: Union[str, None] = "0022_staff_deactivation_overrides"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reimbursement_policies",
        sa.Column(
            "doctor_receipt_threshold",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="500.00",
        ),
    )
    op.add_column(
        "doctor_expenses",
        sa.Column("approved_amount", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "manual_doctor_expense_review_events",
        sa.Column(
            "submitted_amount", sa.Numeric(12, 2), nullable=False,
            server_default="0.00"
        ),
    )
    op.add_column(
        "manual_doctor_expense_review_events",
        sa.Column("approved_amount", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "doctor_expenses",
        sa.Column(
            "receipt_threshold_applied", sa.Numeric(12, 2), nullable=True
        ),
    )
    op.add_column(
        "doctor_expenses",
        sa.Column(
            "receipt_required", sa.Boolean(), nullable=False, server_default="0"
        ),
    )


def downgrade() -> None:
    op.drop_column("manual_doctor_expense_review_events", "approved_amount")
    op.drop_column("manual_doctor_expense_review_events", "submitted_amount")
    op.drop_column("doctor_expenses", "receipt_required")
    op.drop_column("doctor_expenses", "receipt_threshold_applied")
    op.drop_column("doctor_expenses", "approved_amount")
    op.drop_column("reimbursement_policies", "doctor_receipt_threshold")
