"""Add centralized cross-domain audit events.

Revision ID: 0021_domain_audit_events
Revises: 0020_consultation_lifecycle
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021_domain_audit_events"
down_revision: Union[str, None] = "0020_consultation_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "domain_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("domain", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False, server_default="success"),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("actor_role", sa.String(), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("from_state", sa.String(), nullable=True),
        sa.Column("to_state", sa.String(), nullable=True),
        sa.Column("reason_code", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("related_entity_type", sa.String(), nullable=True),
        sa.Column("related_entity_id", sa.String(), nullable=True),
        sa.Column("correlation_id", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
    )
    for name, columns in (
        ("ix_domain_audit_events_id", ["id"]),
        ("ix_domain_audit_events_domain", ["domain"]),
        ("ix_domain_audit_events_entity_type", ["entity_type"]),
        ("ix_domain_audit_events_action", ["action"]),
        ("ix_domain_audit_events_actor_id", ["actor_id"]),
        ("ix_domain_audit_events_business_date", ["business_date"]),
        ("ix_domain_audit_events_reason_code", ["reason_code"]),
        ("ix_domain_audit_events_correlation_id", ["correlation_id"]),
        ("ix_domain_audit_events_occurred_at", ["occurred_at"]),
        (
            "ix_domain_audit_events_entity",
            ["entity_type", "entity_id"],
        ),
        (
            "ix_domain_audit_events_domain_occurred",
            ["domain", "occurred_at"],
        ),
    ):
        op.create_index(name, "domain_audit_events", columns)


def downgrade() -> None:
    op.drop_table("domain_audit_events")
