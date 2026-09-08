"""Add effective-dated location policy and exception snapshots.

Revision ID: 0016_location_policy
Revises: 0015_location_exceptions
Create Date: 2026-09-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_location_policy"
down_revision: Union[str, None] = "0015_location_exceptions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "location_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("geofence_radius_m", sa.Float(), nullable=False),
        sa.Column("gps_accuracy_threshold_m", sa.Float(), nullable=False),
        sa.Column("evidence_max_age_minutes", sa.Integer(), nullable=False),
        sa.Column("approval_valid_hours", sa.Integer(), nullable=False),
        sa.Column("max_evidence_movement_m", sa.Float(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
    )
    for column_name in ("version", "effective_from", "effective_to"):
        op.create_index(
            f"ix_location_policies_{column_name}",
            "location_policies",
            [column_name],
            unique=(column_name == "version"),
        )
    op.execute(
        sa.text(
            """
            INSERT INTO location_policies
                (version, effective_from, geofence_radius_m,
                 gps_accuracy_threshold_m, evidence_max_age_minutes,
                 approval_valid_hours, max_evidence_movement_m)
            VALUES (1, '1970-01-01', 250, 250, 15, 8, 250)
            """
        )
    )

    op.add_column(
        "location_exception_requests",
        sa.Column("location_policy_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "location_exception_requests",
        sa.Column(
            "location_policy_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "location_exception_requests",
        sa.Column(
            "gps_accuracy_threshold_m",
            sa.Float(),
            nullable=False,
            server_default="250",
        ),
    )
    op.add_column(
        "location_exception_requests",
        sa.Column(
            "evidence_max_age_minutes",
            sa.Integer(),
            nullable=False,
            server_default="15",
        ),
    )
    op.add_column(
        "location_exception_requests",
        sa.Column(
            "approval_valid_hours",
            sa.Integer(),
            nullable=False,
            server_default="8",
        ),
    )
    op.add_column(
        "location_exception_requests",
        sa.Column(
            "max_evidence_movement_m",
            sa.Float(),
            nullable=False,
            server_default="250",
        ),
    )
    op.execute(
        "UPDATE location_exception_requests "
        "SET location_policy_id = 1 WHERE location_policy_id IS NULL"
    )
    op.create_index(
        "ix_location_exception_requests_location_policy_id",
        "location_exception_requests",
        ["location_policy_id"],
    )
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_location_exception_location_policy",
            "location_exception_requests",
            "location_policies",
            ["location_policy_id"],
            ["id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "fk_location_exception_location_policy",
            "location_exception_requests",
            type_="foreignkey",
        )
    op.drop_index(
        "ix_location_exception_requests_location_policy_id",
        table_name="location_exception_requests",
    )
    for column_name in (
        "max_evidence_movement_m",
        "approval_valid_hours",
        "evidence_max_age_minutes",
        "gps_accuracy_threshold_m",
        "location_policy_version",
        "location_policy_id",
    ):
        op.drop_column("location_exception_requests", column_name)
    op.drop_table("location_policies")
