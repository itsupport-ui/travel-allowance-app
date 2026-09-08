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


class ManualTravelReviewMigrationTests(unittest.TestCase):
    def test_upgrade_backfills_unclaimed_manual_entries_and_downgrades(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        travel_entries = sa.Table(
            "travel_entries",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("schedule_id", sa.Integer(), nullable=True),
            sa.Column("claim_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
        )
        metadata.create_all(engine)
        migration = _load_migration(
            "0018_manual_travel_review.py",
            "manual_travel_review_migration",
        )

        with engine.begin() as connection:
            connection.execute(
                travel_entries.insert(),
                [
                    {"id": 1, "schedule_id": None, "claim_id": None, "status": "draft"},
                    {"id": 2, "schedule_id": None, "claim_id": 4, "status": "submitted"},
                    {"id": 3, "schedule_id": 9, "claim_id": None, "status": "draft"},
                ],
            )
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn(
                    "manual_travel_review_events",
                    inspector.get_table_names(),
                )
                statuses = connection.execute(
                    sa.text(
                        "SELECT id, manual_review_status FROM travel_entries ORDER BY id"
                    )
                ).all()
                self.assertEqual(statuses, [(1, "pending"), (2, "approved"), (3, None)])

                migration.downgrade()
                downgraded = sa.inspect(connection)
                self.assertNotIn(
                    "manual_travel_review_events",
                    downgraded.get_table_names(),
                )
                self.assertNotIn(
                    "manual_review_status",
                    {
                        column["name"]
                        for column in downgraded.get_columns("travel_entries")
                    },
                )


if __name__ == "__main__":
    unittest.main()
