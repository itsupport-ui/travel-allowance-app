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


class EarlyWorkdayReviewMigrationTests(unittest.TestCase):
    def test_upgrade_backfills_pending_and_downgrade_removes_review_fields(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        for table_name in ("therapist_work_days", "doctor_work_days"):
            table = sa.Table(
                table_name,
                metadata,
                sa.Column("id", sa.Integer(), primary_key=True),
                sa.Column("ended_early", sa.Boolean(), nullable=False),
            )
        metadata.create_all(engine)
        migration = _load_migration(
            "0017_early_workday_review.py",
            "early_workday_review_migration",
        )

        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO therapist_work_days (id, ended_early) VALUES (1, true)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO doctor_work_days (id, ended_early) VALUES (1, false)"
                )
            )
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                for table_name in ("therapist_work_days", "doctor_work_days"):
                    columns = {
                        column["name"] for column in inspector.get_columns(table_name)
                    }
                    self.assertTrue(
                        {
                            "early_end_review_status",
                            "early_end_reviewed_by",
                            "early_end_review_reason",
                            "early_end_reviewed_at",
                            "early_end_review_version",
                        }.issubset(columns)
                    )
                self.assertEqual(
                    connection.execute(
                        sa.text(
                            "SELECT early_end_review_status "
                            "FROM therapist_work_days WHERE id = 1"
                        )
                    ).scalar_one(),
                    "pending",
                )
                self.assertIsNone(
                    connection.execute(
                        sa.text(
                            "SELECT early_end_review_status "
                            "FROM doctor_work_days WHERE id = 1"
                        )
                    ).scalar_one()
                )

                migration.downgrade()
                downgraded = sa.inspect(connection)
                self.assertNotIn(
                    "early_end_review_status",
                    {
                        column["name"]
                        for column in downgraded.get_columns(
                            "therapist_work_days"
                        )
                    },
                )


if __name__ == "__main__":
    unittest.main()
