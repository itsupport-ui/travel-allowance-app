"""add pluggable report artifact storage

Revision ID: 0025_report_artifact_storage
Revises: 0024_async_report_exports
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_report_artifact_storage"
down_revision = "0024_async_report_exports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "report_export_jobs",
        sa.Column(
            "artifact_storage",
            sa.String(length=20),
            nullable=False,
            server_default="database",
        ),
    )
    op.add_column(
        "report_export_jobs",
        sa.Column("artifact_container", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "report_export_jobs",
        sa.Column("artifact_key", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("report_export_jobs", "artifact_key")
    op.drop_column("report_export_jobs", "artifact_container")
    op.drop_column("report_export_jobs", "artifact_storage")
