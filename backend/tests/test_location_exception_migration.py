import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load_migration_module():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0015_location_exception_requests.py"
    )
    spec = importlib.util.spec_from_file_location(
        "location_exception_migration",
        migration_path,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class LocationExceptionMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_create_expected_constraints(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        sa.Table(
            "doctor_visits",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
        )
        sa.Table(
            "treatment_schedules",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
        )
        metadata.create_all(engine)
        migration = _load_migration_module()

        with engine.begin() as connection:
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn(
                    "location_exception_requests",
                    inspector.get_table_names(),
                )
                columns = {
                    column["name"]
                    for column in inspector.get_columns(
                        "location_exception_requests"
                    )
                }
                self.assertTrue(
                    {
                        "active_key",
                        "business_date",
                        "doctor_visit_id",
                        "schedule_id",
                        "version",
                    }.issubset(columns)
                )
                unique_names = {
                    constraint["name"]
                    for constraint in inspector.get_unique_constraints(
                        "location_exception_requests"
                    )
                }
                self.assertIn(
                    "uq_location_exception_active_key",
                    unique_names,
                )

                migration.downgrade()
                self.assertNotIn(
                    "location_exception_requests",
                    sa.inspect(connection).get_table_names(),
                )


if __name__ == "__main__":
    unittest.main()
