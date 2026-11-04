import importlib.util
import unittest
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "0031_freelance_visits.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_0031", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FreelanceMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = sa.create_engine("sqlite://")
        with self.engine.begin() as connection:
            for table in ("users", "doctors", "treatment_plans"):
                connection.execute(
                    sa.text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)")
                )
        self.migration = _load_migration()

    def run_op(self, name):
        with self.engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                getattr(self.migration, name)()

    def tables(self):
        return set(sa.inspect(self.engine).get_table_names())

    def test_upgrade_downgrade_and_idempotent_upgrade(self):
        self.run_op("upgrade")
        self.assertTrue({"freelance_therapists", "freelance_visits"} <= self.tables())
        # A second run (tables created earlier by AUTO_CREATE_SCHEMA) is a no-op.
        self.run_op("upgrade")
        self.run_op("downgrade")
        self.assertFalse({"freelance_therapists", "freelance_visits"} & self.tables())


if __name__ == "__main__":
    unittest.main()
