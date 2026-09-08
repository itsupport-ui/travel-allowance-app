import importlib.util
import unittest
from datetime import date, datetime
from pathlib import Path

import sqlalchemy as sa


def _load_migration_module():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0007_recurring_schedule_occurrences.py"
    )
    spec = importlib.util.spec_from_file_location(
        "recurring_schedule_migration",
        migration_path,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class RecurringScheduleMigrationTests(unittest.TestCase):
    def test_legacy_series_expands_without_copying_terminal_evidence(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        series = sa.Table(
            "treatment_schedule_series",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("cadence_days", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_by", sa.Integer(), nullable=True),
        )
        schedules = sa.Table(
            "treatment_schedules",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("patient_name", sa.String(), nullable=False),
            sa.Column("schedule_type", sa.String(), nullable=False),
            sa.Column("treatment_date", sa.Date(), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("completion_notes", sa.String(), nullable=True),
            sa.Column("missed_reason", sa.String(), nullable=True),
            sa.Column("session_status", sa.String(), nullable=True),
            sa.Column("series_id", sa.Integer(), nullable=True),
            sa.Column("occurrence_date", sa.Date(), nullable=True),
        )
        metadata.create_all(engine)

        with engine.begin() as connection:
            connection.execute(
                schedules.insert().values(
                    patient_name="Legacy patient",
                    schedule_type="recurring",
                    start_date=date(2026, 1, 1),
                    end_date=date(2026, 1, 3),
                    status="completed",
                    completed_at=datetime(2026, 1, 2, 11, 0),
                    completion_notes="Completed visit",
                    session_status="COMPLETED",
                )
            )
            _load_migration_module()._expand_legacy_series(connection)

            migrated = connection.execute(
                sa.select(schedules).order_by(schedules.c.occurrence_date)
            ).mappings().all()
            self.assertEqual(len(migrated), 3)
            self.assertEqual(
                [row["occurrence_date"] for row in migrated],
                [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3)],
            )
            self.assertEqual(
                [row["status"] for row in migrated],
                ["scheduled", "completed", "scheduled"],
            )
            self.assertEqual(
                [row["session_status"] for row in migrated],
                ["NOT_STARTED", "COMPLETED", "NOT_STARTED"],
            )
            self.assertEqual(
                len({row["series_id"] for row in migrated}),
                1,
            )
            self.assertEqual(
                connection.execute(sa.select(sa.func.count(series.c.id))).scalar(),
                1,
            )


if __name__ == "__main__":
    unittest.main()
