import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "0030_doctor_expense_task_link.py"
)


def _load():
    spec = importlib.util.spec_from_file_location("m0030", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class DoctorExpenseTaskLinkMigrationTests(unittest.TestCase):
    def test_upgrade_adds_a_unique_task_link_and_downgrade_removes_it(self):
        engine = sa.create_engine("sqlite://")
        metadata = sa.MetaData()
        sa.Table("doctor_tasks", metadata, sa.Column("id", sa.Integer(), primary_key=True))
        sa.Table(
            "doctor_expenses",
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("fare", sa.Numeric(12, 2), nullable=False),
        )
        metadata.create_all(engine)
        migration = _load()

        with engine.begin() as connection:
            operations = Operations(MigrationContext.configure(connection))
            with patch.object(migration, "op", operations):
                migration.upgrade()
                inspector = sa.inspect(connection)
                self.assertIn(
                    "task_id",
                    {c["name"] for c in inspector.get_columns("doctor_expenses")},
                )

                connection.execute(sa.text("INSERT INTO doctor_tasks (id) VALUES (1)"))
                insert = (
                    "INSERT INTO doctor_expenses (fare, task_id) VALUES (10, 1)"
                )
                connection.execute(sa.text(insert))
                with self.assertRaises(sa.exc.IntegrityError):
                    with connection.begin_nested():
                        connection.execute(sa.text(insert))

                migration.downgrade()
                self.assertNotIn(
                    "task_id",
                    {
                        c["name"]
                        for c in sa.inspect(connection).get_columns("doctor_expenses")
                    },
                )
                self.assertEqual(
                    connection.execute(
                        sa.text("SELECT COUNT(*) FROM doctor_expenses")
                    ).scalar(),
                    1,
                )


if __name__ == "__main__":
    unittest.main()
