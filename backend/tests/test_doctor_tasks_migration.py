import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = Path(__file__).parents[1] / "alembic" / "versions"


def _load(filename: str, name: str):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class DoctorTasksMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_round_trip(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        for table in ("users", "doctors", "doctor_visits", "treatment_schedules"):
            sa.Table(table, metadata, sa.Column("id", sa.Integer(), primary_key=True))
        sa.Table(
            "doctor_travel_waypoints",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workday_id", sa.Integer(), nullable=False),
        )
        metadata.create_all(engine)
        exceptions = _load("0015_location_exception_requests.py", "m0015")
        tasks = _load("0029_doctor_tasks_places.py", "m0029")

        with engine.begin() as connection:
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(exceptions, "op", operations):
                exceptions.upgrade()
            with patch.object(tasks, "op", operations):
                tasks.upgrade()
                inspector = sa.inspect(connection)
                self.assertTrue(
                    {"places", "doctor_tasks"}.issubset(inspector.get_table_names())
                )
                self.assertIn(
                    "task_id",
                    {c["name"] for c in inspector.get_columns("doctor_travel_waypoints")},
                )
                self.assertIn(
                    "doctor_task_id",
                    {
                        c["name"]
                        for c in inspector.get_columns("location_exception_requests")
                    },
                )

                self._check_target_constraint(connection)

                tasks.downgrade()
                inspector = sa.inspect(connection)
                self.assertNotIn("doctor_tasks", inspector.get_table_names())
                self.assertNotIn(
                    "doctor_task_id",
                    {
                        c["name"]
                        for c in inspector.get_columns("location_exception_requests")
                    },
                )

    def _check_target_constraint(self, connection):
        connection.execute(sa.text("INSERT INTO users (id) VALUES (1)"))
        connection.execute(sa.text("INSERT INTO doctors (id) VALUES (1)"))
        connection.execute(
            sa.text(
                "INSERT INTO doctor_tasks (id, task_type, title, assigned_by, "
                "doctor_id, scheduled_date) VALUES "
                "(1, 'other', 'T', 1, 1, '2026-10-17')"
            )
        )
        base = (
            "INSERT INTO location_exception_requests (requested_by, staff_role, "
            "{columns}action, business_date, reason, captured_latitude, "
            "captured_longitude, gps_accuracy_m, device_timestamp, "
            "geofence_radius_m, evidence_quality) VALUES (1, 'doctor', {values}"
            "'punch_in', '2026-10-17', 'reason text', 1, 1, 5, "
            "'2026-10-17 00:00:00', 200, 'good')"
        )
        connection.execute(
            sa.text(base.format(columns="doctor_task_id, ", values="1, "))
        )
        for columns, values in (
            ("", ""),
            ("doctor_task_id, doctor_visit_id, ", "1, 1, "),
        ):
            with self.assertRaises(sa.exc.IntegrityError):
                with connection.begin_nested():
                    connection.execute(
                        sa.text(base.format(columns=columns, values=values))
                    )


if __name__ == "__main__":
    unittest.main()
