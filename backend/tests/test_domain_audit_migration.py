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


class DomainAuditMigrationTests(unittest.TestCase):
    def test_upgrade_creates_immutable_audit_table_then_downgrades(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        metadata.create_all(engine)
        migration = _load_migration(
            "0021_domain_audit_events.py",
            "domain_audit_events_migration",
        )

        with engine.begin() as connection:
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn("domain_audit_events", inspector.get_table_names())
                columns = {
                    column["name"]
                    for column in inspector.get_columns("domain_audit_events")
                }
                self.assertTrue(
                    {
                        "actor_id",
                        "business_date",
                        "domain",
                        "entity_id",
                        "entity_type",
                        "occurred_at",
                    }.issubset(columns)
                )

                migration.downgrade()
                self.assertNotIn(
                    "domain_audit_events",
                    sa.inspect(connection).get_table_names(),
                )


if __name__ == "__main__":
    unittest.main()
