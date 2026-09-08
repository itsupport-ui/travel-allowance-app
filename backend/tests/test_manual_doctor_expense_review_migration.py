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


class ManualDoctorExpenseReviewMigrationTests(unittest.TestCase):
    def test_upgrade_backfills_manual_entries_and_downgrades(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("users", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        expenses = sa.Table(
            "doctor_expenses",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("visit_id", sa.Integer(), nullable=True),
            sa.Column("claim_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
        )
        metadata.create_all(engine)
        migration = _load_migration(
            "0019_manual_doctor_expense_review.py",
            "manual_doctor_expense_review_migration",
        )

        with engine.begin() as connection:
            connection.execute(
                expenses.insert(),
                [
                    {"id": 1, "visit_id": None, "claim_id": None, "status": "draft"},
                    {"id": 2, "visit_id": None, "claim_id": 4, "status": "submitted"},
                    {"id": 3, "visit_id": 8, "claim_id": None, "status": "draft"},
                ],
            )
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn(
                    "manual_doctor_expense_review_events",
                    inspector.get_table_names(),
                )
                rows = connection.execute(
                    sa.text(
                        "SELECT id, expense_category, manual_review_status "
                        "FROM doctor_expenses ORDER BY id"
                    )
                ).all()
                self.assertEqual(
                    rows,
                    [
                        (1, "authorized_other", "pending"),
                        (2, "authorized_other", "approved"),
                        (3, "public_transport", None),
                    ],
                )

                migration.downgrade()
                downgraded = sa.inspect(connection)
                self.assertNotIn(
                    "manual_doctor_expense_review_events",
                    downgraded.get_table_names(),
                )
                self.assertNotIn(
                    "manual_review_status",
                    {
                        column["name"]
                        for column in downgraded.get_columns("doctor_expenses")
                    },
                )


if __name__ == "__main__":
    unittest.main()
