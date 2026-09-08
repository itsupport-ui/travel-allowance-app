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


class LocationPolicyMigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_snapshot_policy_fields(self):
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
        exception_migration = _load_migration(
            "0015_location_exception_requests.py",
            "location_exception_migration_for_policy",
        )
        policy_migration = _load_migration(
            "0016_effective_location_policy.py",
            "effective_location_policy_migration",
        )

        with engine.begin() as connection:
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(exception_migration, "op", operations):
                exception_migration.upgrade()
            with patch.object(policy_migration, "op", operations):
                policy_migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn("location_policies", inspector.get_table_names())
                policy = connection.execute(
                    sa.text(
                        "SELECT version, geofence_radius_m, "
                        "evidence_max_age_minutes FROM location_policies"
                    )
                ).mappings().one()
                self.assertEqual(policy["version"], 1)
                self.assertEqual(policy["geofence_radius_m"], 250)
                self.assertEqual(policy["evidence_max_age_minutes"], 15)

                exception_columns = {
                    column["name"]
                    for column in inspector.get_columns(
                        "location_exception_requests"
                    )
                }
                self.assertTrue(
                    {
                        "location_policy_id",
                        "location_policy_version",
                        "gps_accuracy_threshold_m",
                        "approval_valid_hours",
                        "max_evidence_movement_m",
                    }.issubset(exception_columns)
                )

                policy_migration.downgrade()
                downgraded = sa.inspect(connection)
                self.assertNotIn(
                    "location_policies",
                    downgraded.get_table_names(),
                )
                self.assertNotIn(
                    "location_policy_id",
                    {
                        column["name"]
                        for column in downgraded.get_columns(
                            "location_exception_requests"
                        )
                    },
                )


if __name__ == "__main__":
    unittest.main()
