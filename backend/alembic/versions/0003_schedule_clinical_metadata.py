"""Add clinical scheduling metadata and operational indexes.

Revision ID: 0003_schedule_metadata
Revises: 0002_duplicate_constraints
Create Date: 2026-07-27 00:00:00
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_schedule_metadata"
down_revision: Union[str, None] = "0002_duplicate_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "treatment_schedules",
        sa.Column("patient_reference_id", sa.String(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("patient_phone", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column(
            "visit_type",
            sa.String(),
            server_default="home_visit",
            nullable=False,
        ),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("clinical_notes", sa.String(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("precautions", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_treatment_schedules_status",
        "treatment_schedules",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_treatment_schedules_treatment_date",
        "treatment_schedules",
        ["treatment_date"],
        unique=False,
    )
    op.create_index(
        "ix_treatment_schedules_therapist_id",
        "treatment_schedules",
        ["therapist_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_treatment_schedules_therapist_id",
        table_name="treatment_schedules",
    )
    op.drop_index(
        "ix_treatment_schedules_treatment_date",
        table_name="treatment_schedules",
    )
    op.drop_index(
        "ix_treatment_schedules_status",
        table_name="treatment_schedules",
    )
    op.drop_column("treatment_schedules", "precautions")
    op.drop_column("treatment_schedules", "clinical_notes")
    op.drop_column("treatment_schedules", "visit_type")
    op.drop_column("treatment_schedules", "patient_phone")
    op.drop_column("treatment_schedules", "patient_reference_id")
