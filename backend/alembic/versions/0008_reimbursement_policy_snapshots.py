"""Add effective-dated reimbursement policies and decimal snapshots.

Revision ID: 0008_financial_policy
Revises: 0007_schedule_occurrences
Create Date: 2026-08-31 00:00:00
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_financial_policy"
down_revision: Union[str, None] = "0007_schedule_occurrences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NUMERIC_COLUMNS = {
    "claims": [
        "total_km",
        "travel_total",
        "daily_allowance",
        "grand_total",
        "per_km_rate",
        "distance_km",
    ],
    "doctor_claims": ["total_amount"],
    "doctor_expenses": ["fare"],
    "travel_entries": [
        "total_km",
        "per_km_rate",
        "travel_fare",
        "bill_amount",
    ],
}


def _alter_numeric_columns(
    bind,
    target_type,
    source_type,
    postgresql_cast: str,
) -> None:
    for table_name, columns in NUMERIC_COLUMNS.items():
        if bind.dialect.name == "postgresql":
            for column_name in columns:
                op.alter_column(
                    table_name,
                    column_name,
                    existing_type=source_type,
                    type_=target_type,
                    postgresql_using=(
                        f"{column_name}::{postgresql_cast}"
                    ),
                )
        else:
            with op.batch_alter_table(table_name) as batch_op:
                for column_name in columns:
                    batch_op.alter_column(
                        column_name,
                        existing_type=source_type,
                        type_=target_type,
                    )


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "reimbursement_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, unique=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("per_km_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("daily_allowance", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "rounding_mode",
            sa.String(),
            nullable=False,
            server_default="ROUND_HALF_UP",
        ),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    op.create_index(
        "ix_reimbursement_policies_effective_from",
        "reimbursement_policies",
        ["effective_from"],
    )
    op.create_index(
        "ix_reimbursement_policies_effective_to",
        "reimbursement_policies",
        ["effective_to"],
    )
    op.execute(
        sa.text(
            """
            INSERT INTO reimbursement_policies
                (version, effective_from, per_km_rate, daily_allowance,
                 rounding_mode)
            SELECT 1, '1970-01-01',
                   COALESCE((SELECT per_km_rate FROM settings ORDER BY id LIMIT 1), 8),
                   COALESCE((SELECT daily_allowance FROM settings ORDER BY id LIMIT 1), 150),
                   'ROUND_HALF_UP'
            """
        )
    )

    _alter_numeric_columns(
        bind,
        sa.Numeric(12, 2),
        sa.Float(),
        "numeric(12,2)",
    )

    op.add_column("travel_entries", sa.Column("policy_id", sa.Integer(), nullable=True))
    op.add_column("claims", sa.Column("policy_id", sa.Integer(), nullable=True))
    for table_name in ("travel_entries", "claims", "doctor_claims"):
        op.add_column(
            table_name,
            sa.Column(
                "calculation_version",
                sa.String(),
                nullable=False,
                server_default="decimal-v1",
            ),
        )
        op.add_column(
            table_name,
            sa.Column(
                "rounding_mode",
                sa.String(),
                nullable=False,
                server_default="ROUND_HALF_UP",
            ),
        )
    op.add_column("claims", sa.Column("included_travel_ids", sa.JSON(), nullable=True))
    op.add_column(
        "doctor_claims",
        sa.Column("included_expense_ids", sa.JSON(), nullable=True),
    )
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_travel_entries_policy",
            "travel_entries",
            "reimbursement_policies",
            ["policy_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_claims_policy",
            "claims",
            "reimbursement_policies",
            ["policy_id"],
            ["id"],
        )
    op.execute(
        "UPDATE travel_entries SET policy_id = 1 WHERE policy_id IS NULL"
    )
    op.execute("UPDATE claims SET policy_id = 1 WHERE policy_id IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint("fk_claims_policy", "claims", type_="foreignkey")
        op.drop_constraint(
            "fk_travel_entries_policy",
            "travel_entries",
            type_="foreignkey",
        )
    op.drop_column("doctor_claims", "included_expense_ids")
    op.drop_column("claims", "included_travel_ids")
    for table_name in ("doctor_claims", "claims", "travel_entries"):
        op.drop_column(table_name, "rounding_mode")
        op.drop_column(table_name, "calculation_version")
    op.drop_column("claims", "policy_id")
    op.drop_column("travel_entries", "policy_id")
    _alter_numeric_columns(
        bind,
        sa.Float(),
        sa.Numeric(12, 2),
        "double precision",
    )
    op.drop_index(
        "ix_reimbursement_policies_effective_to",
        table_name="reimbursement_policies",
    )
    op.drop_index(
        "ix_reimbursement_policies_effective_from",
        table_name="reimbursement_policies",
    )
    op.drop_table("reimbursement_policies")
