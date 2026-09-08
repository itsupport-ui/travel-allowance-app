import importlib.util
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load_migration():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0025_report_artifact_storage.py"
    )
    spec = importlib.util.spec_from_file_location(
        "report_artifact_storage_migration", migration_path
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_report_artifact_storage_migration_defaults_existing_jobs_to_database():
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    jobs = sa.Table(
        "report_export_jobs",
        metadata,
        sa.Column("id", sa.String(36), primary_key=True),
    )
    metadata.create_all(engine)
    migration = _load_migration()

    with engine.begin() as connection:
        connection.execute(jobs.insert(), {"id": "job-1"})
        operations = Operations(MigrationContext.configure(connection))
        with patch.object(migration, "op", operations):
            migration.upgrade()
            row = connection.execute(
                sa.text(
                    "SELECT artifact_storage, artifact_container, artifact_key "
                    "FROM report_export_jobs WHERE id = 'job-1'"
                )
            ).one()
            assert row == ("database", None, None)
            migration.downgrade()
            columns = {
                column["name"]
                for column in sa.inspect(connection).get_columns(
                    "report_export_jobs"
                )
            }
            assert "artifact_storage" not in columns
            assert "artifact_container" not in columns
            assert "artifact_key" not in columns
