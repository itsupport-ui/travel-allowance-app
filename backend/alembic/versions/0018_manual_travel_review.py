"""Add revisioned review lifecycle for manual therapist travel.

Revision ID: 0018_manual_travel_review
Revises: 0017_early_workday_review
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_manual_travel_review"
down_revision: Union[str, None] = "0017_early_workday_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column(
        "travel_entries",
        sa.Column("manual_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "travel_entries",
        sa.Column("manual_review_status", sa.String(), nullable=True),
    )
    op.add_column(
        "travel_entries",
        sa.Column("manual_reviewed_by", sa.Integer(), nullable=True),
    )
    op.add_column(
        "travel_entries",
        sa.Column("manual_review_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "travel_entries",
        sa.Column(
            "manual_reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "travel_entries",
        sa.Column(
            "manual_revision",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "travel_entries",
        sa.Column(
            "manual_review_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "travel_entries",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            "UPDATE travel_entries SET updated_at = CURRENT_TIMESTAMP "
            "WHERE updated_at IS NULL"
        )
    )
    op.create_index(
        "ix_travel_entries_manual_review_status",
        "travel_entries",
        ["manual_review_status"],
    )
    op.execute(
        sa.text(
            "UPDATE travel_entries "
            "SET manual_reason = 'Legacy manual entry; reason was not captured', "
            "manual_review_status = CASE "
            "WHEN claim_id IS NOT NULL OR status <> 'draft' THEN 'approved' "
            "ELSE 'pending' END "
            "WHERE schedule_id IS NULL"
        )
    )
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_travel_entries_manual_reviewed_by",
            "travel_entries",
            "users",
            ["manual_reviewed_by"],
            ["id"],
        )

    op.create_table(
        "manual_travel_review_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("travel_id", sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(["travel_id"], ["travel_entries.id"]),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
    )
    op.create_index(
        "ix_manual_travel_review_events_travel_id",
        "manual_travel_review_events",
        ["travel_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_table("manual_travel_review_events")
    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "fk_travel_entries_manual_reviewed_by",
            "travel_entries",
            type_="foreignkey",
        )
    op.drop_index(
        "ix_travel_entries_manual_review_status",
        table_name="travel_entries",
    )
    for column_name in (
        "updated_at",
        "manual_review_version",
        "manual_revision",
        "manual_reviewed_at",
        "manual_review_reason",
        "manual_reviewed_by",
        "manual_review_status",
        "manual_reason",
    ):
        op.drop_column("travel_entries", column_name)
