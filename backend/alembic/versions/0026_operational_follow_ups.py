"""add cross-domain operational follow-ups

Revision ID: 0026_operational_follow_ups
Revises: 0025_report_artifact_storage
"""

from alembic import op
import sqlalchemy as sa


revision = "0026_operational_follow_ups"
down_revision = "0025_report_artifact_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operational_follow_ups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_domain", sa.String(length=50), nullable=False),
        sa.Column("source_entity_type", sa.String(length=80), nullable=False),
        sa.Column("source_entity_id", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("assignee_id", sa.Integer(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_reason", sa.Text(), nullable=False),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("resolved_by", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["resolved_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_operational_follow_ups_id", "operational_follow_ups", ["id"])
    op.create_index("ix_operational_follow_ups_source_domain", "operational_follow_ups", ["source_domain"])
    op.create_index("ix_operational_follow_ups_status", "operational_follow_ups", ["status"])
    op.create_index("ix_operational_follow_ups_assignee_id", "operational_follow_ups", ["assignee_id"])
    op.create_index("ix_operational_follow_ups_due_date", "operational_follow_ups", ["due_date"])
    op.create_index("ix_operational_follow_ups_queue", "operational_follow_ups", ["status", "due_date"])
    op.create_index("ix_operational_follow_ups_source", "operational_follow_ups", ["source_domain", "source_entity_type", "source_entity_id"])
    op.create_index(
        "uq_operational_follow_ups_active_source",
        "operational_follow_ups",
        ["source_domain", "source_entity_type", "source_entity_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('open', 'in_progress')"),
        sqlite_where=sa.text("status IN ('open', 'in_progress')"),
    )


def downgrade() -> None:
    op.drop_table("operational_follow_ups")
