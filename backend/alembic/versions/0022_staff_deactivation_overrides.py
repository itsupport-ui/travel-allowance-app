"""Add formal staff-deactivation override governance.

Revision ID: 0022_staff_deactivation_overrides
Revises: 0021_domain_audit_events
Create Date: 2026-09-02 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022_staff_deactivation_overrides"
down_revision: Union[str, None] = "0021_domain_audit_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_deactivation_overrides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "rule_code",
            sa.String(length=80),
            nullable=False,
            server_default="STAFF_DEACTIVATION_WITH_OPEN_IMPACTS",
        ),
        sa.Column("subject_role", sa.String(length=20), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("request_reason", sa.Text(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("captured_conditions", sa.JSON(), nullable=False),
        sa.Column("condition_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("before_state", sa.JSON(), nullable=False),
        sa.Column("after_state", sa.JSON(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("active_key", sa.String(length=160), nullable=True),
        sa.Column("decided_by", sa.Integer(), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_by", sa.Integer(), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["consumed_by"], ["users.id"]),
    )
    for name, columns, unique in (
        ("ix_staff_deactivation_overrides_rule_code", ["rule_code"], False),
        ("ix_staff_deactivation_overrides_subject_role", ["subject_role"], False),
        ("ix_staff_deactivation_overrides_subject_id", ["subject_id"], False),
        ("ix_staff_deactivation_overrides_requested_by", ["requested_by"], False),
        ("ix_staff_deactivation_overrides_status", ["status"], False),
        ("ix_staff_deactivation_overrides_decided_by", ["decided_by"], False),
        ("ix_staff_deactivation_overrides_expires_at", ["expires_at"], False),
        ("ix_staff_deactivation_overrides_created_at", ["created_at"], False),
        (
            "ix_staff_deactivation_overrides_subject",
            ["subject_role", "subject_id"],
            False,
        ),
        (
            "uq_staff_deactivation_overrides_active_key",
            ["active_key"],
            True,
        ),
    ):
        op.create_index(
            name,
            "staff_deactivation_overrides",
            columns,
            unique=unique,
        )


def downgrade() -> None:
    op.drop_table("staff_deactivation_overrides")
