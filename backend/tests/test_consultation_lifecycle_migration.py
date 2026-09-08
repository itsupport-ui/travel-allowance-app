import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load_migration(filename: str, module_name: str):
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / filename
    spec = importlib.util.spec_from_file_location(module_name, migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class ConsultationLifecycleMigrationTests(unittest.TestCase):
    def test_upgrade_backfills_version_and_creates_events_then_downgrades(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        sa.Table("doctor_visits", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        consultations = sa.Table(
            "doctor_consultations",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
        metadata.create_all(engine)
        migration = _load_migration(
            "0020_consultation_lifecycle.py",
            "consultation_lifecycle_migration",
        )

        with engine.begin() as connection:
            connection.execute(consultations.insert(), {"id": 1})
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn(
                    "doctor_consultation_events",
                    inspector.get_table_names(),
                )
                row = connection.execute(
                    sa.text(
                        "SELECT lifecycle_version, updated_at "
                        "FROM doctor_consultations WHERE id = 1"
                    )
                ).one()
                self.assertEqual(row.lifecycle_version, 1)
                self.assertIsNotNone(row.updated_at)

                migration.downgrade()
                downgraded = sa.inspect(connection)
                self.assertNotIn(
                    "doctor_consultation_events",
                    downgraded.get_table_names(),
                )
                self.assertNotIn(
                    "lifecycle_version",
                    {
                        column["name"]
                        for column in downgraded.get_columns(
                            "doctor_consultations"
                        )
                    },
                )


if __name__ == "__main__":
    unittest.main()
