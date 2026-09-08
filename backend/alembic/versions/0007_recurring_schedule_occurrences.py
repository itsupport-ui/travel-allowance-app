"""Split recurring schedules into independently executable occurrences.

Revision ID: 0007_schedule_occurrences
Revises: 0006_business_logic
Create Date: 2026-08-30 00:00:00
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_schedule_occurrences"
down_revision: Union[str, None] = "0006_business_logic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _expand_legacy_series(bind) -> None:
    metadata = sa.MetaData()
    schedules = sa.Table(
        "treatment_schedules",
        metadata,
        autoload_with=bind,
    )
    series = sa.Table(
        "treatment_schedule_series",
        metadata,
        autoload_with=bind,
    )

    bind.execute(
        schedules.update()
        .where(schedules.c.schedule_type == "one_time")
        .where(schedules.c.occurrence_date.is_(None))
        .values(occurrence_date=schedules.c.treatment_date)
    )

    legacy_rows = bind.execute(
        sa.select(schedules).where(
            schedules.c.schedule_type == "recurring",
            schedules.c.start_date.is_not(None),
            schedules.c.end_date.is_not(None),
        )
    ).mappings().all()

    today = date.today()
    evidence_fields = {
        "completion_notes": None,
        "completed_at": None,
        "missed_reason": None,
        "punch_in_time": None,
        "punch_out_time": None,
        "punch_in_latitude": None,
        "punch_in_longitude": None,
        "punch_out_latitude": None,
        "punch_out_longitude": None,
        "treatment_duration": None,
        "session_status": "NOT_STARTED",
        "status": "scheduled",
    }
    available_fields = set(schedules.c.keys())

    for row in legacy_rows:
        start = _as_date(row["start_date"])
        end = _as_date(row["end_date"])
        if start is None or end is None or end < start:
            continue

        insert_result = bind.execute(
            series.insert().values(
                start_date=start,
                end_date=end,
                cadence_days=1,
                status="active",
            )
        )
        series_id = insert_result.inserted_primary_key[0]

        completed_date = _as_date(row.get("completed_at"))
        evidence_date = completed_date or (
            today if start <= today <= end else start
        )
        if evidence_date < start or evidence_date > end:
            evidence_date = start

        bind.execute(
            schedules.update()
            .where(schedules.c.id == row["id"])
            .values(
                schedule_type="one_time",
                treatment_date=evidence_date,
                start_date=None,
                end_date=None,
                series_id=series_id,
                occurrence_date=evidence_date,
            )
        )

        occurrence_date = start
        while occurrence_date <= end:
            if occurrence_date != evidence_date:
                values = {
                    key: value
                    for key, value in dict(row).items()
                    if key != "id"
                }
                values.update(
                    {
                        "schedule_type": "one_time",
                        "treatment_date": occurrence_date,
                        "start_date": None,
                        "end_date": None,
                        "series_id": series_id,
                        "occurrence_date": occurrence_date,
                    }
                )
                values.update(
                    {
                        key: value
                        for key, value in evidence_fields.items()
                        if key in available_fields
                    }
                )
                bind.execute(schedules.insert().values(**values))
            occurrence_date += timedelta(days=1)


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "treatment_schedule_series",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "cadence_days",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="active",
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
    op.add_column(
        "treatment_schedules",
        sa.Column("series_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "treatment_schedules",
        sa.Column("occurrence_date", sa.Date(), nullable=True),
    )
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_treatment_schedules_series",
            "treatment_schedules",
            "treatment_schedule_series",
            ["series_id"],
            ["id"],
        )

    if not op.get_context().as_sql:
        _expand_legacy_series(bind)

    op.create_index(
        "ix_treatment_schedules_series_id",
        "treatment_schedules",
        ["series_id"],
    )
    op.create_index(
        "ix_treatment_schedules_occurrence_date",
        "treatment_schedules",
        ["occurrence_date"],
    )
    op.create_index(
        "uq_treatment_schedule_series_occurrence",
        "treatment_schedules",
        ["series_id", "occurrence_date"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index(
        "uq_treatment_schedule_series_occurrence",
        table_name="treatment_schedules",
    )
    op.drop_index(
        "ix_treatment_schedules_occurrence_date",
        table_name="treatment_schedules",
    )
    op.drop_index(
        "ix_treatment_schedules_series_id",
        table_name="treatment_schedules",
    )
    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "fk_treatment_schedules_series",
            "treatment_schedules",
            type_="foreignkey",
        )
    op.drop_column("treatment_schedules", "occurrence_date")
    op.drop_column("treatment_schedules", "series_id")
    op.drop_table("treatment_schedule_series")
