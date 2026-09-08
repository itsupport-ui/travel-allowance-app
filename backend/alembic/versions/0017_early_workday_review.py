"""Add administrator review lifecycle for early workday closures.

Revision ID: 0017_early_workday_review
Revises: 0016_location_policy
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017_early_workday_review"
down_revision: Union[str, None] = "0016_location_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    for table_name in ("therapist_work_days", "doctor_work_days"):
        op.add_column(
            table_name,
            sa.Column("early_end_review_status", sa.String(), nullable=True),
        )
        op.add_column(
            table_name,
            sa.Column("early_end_reviewed_by", sa.Integer(), nullable=True),
        )
        op.add_column(
            table_name,
            sa.Column("early_end_review_reason", sa.Text(), nullable=True),
        )
        op.add_column(
            table_name,
            sa.Column(
                "early_end_reviewed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )
        op.add_column(
            table_name,
            sa.Column(
                "early_end_review_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )
        op.create_index(
            f"ix_{table_name}_early_end_review_status",
            table_name,
            ["early_end_review_status"],
        )
        op.execute(
            sa.text(
                f"UPDATE {table_name} "
                "SET early_end_review_status = 'pending' "
                "WHERE ended_early = true "
                "AND early_end_review_status IS NULL"
            )
        )
        if bind.dialect.name != "sqlite":
            op.create_foreign_key(
                f"fk_{table_name}_early_end_reviewed_by",
                table_name,
                "users",
                ["early_end_reviewed_by"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in ("doctor_work_days", "therapist_work_days"):
        if bind.dialect.name != "sqlite":
            op.drop_constraint(
                f"fk_{table_name}_early_end_reviewed_by",
                table_name,
                type_="foreignkey",
            )
        op.drop_index(
            f"ix_{table_name}_early_end_review_status",
            table_name=table_name,
        )
        for column_name in (
            "early_end_review_version",
            "early_end_reviewed_at",
            "early_end_review_reason",
            "early_end_reviewed_by",
            "early_end_review_status",
        ):
            op.drop_column(table_name, column_name)
