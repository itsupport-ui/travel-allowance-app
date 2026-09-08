from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    LargeBinary,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class ReportExportJob(Base):
    __tablename__ = "report_export_jobs"
    __table_args__ = (
        UniqueConstraint(
            "requested_by",
            "idempotency_key",
            name="uq_report_export_job_requester_idempotency",
        ),
    )

    id = Column(String(36), primary_key=True)
    snapshot_id = Column(
        String(36),
        ForeignKey("report_snapshots.id"),
        nullable=False,
        index=True,
    )
    requested_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    report_type = Column(String, nullable=False)
    scope = Column(String, nullable=False)
    format = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)
    idempotency_key = Column(String(128), nullable=False)
    filename = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    checksum_sha256 = Column(String(64), nullable=True)
    row_count = Column(Integer, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    summary = Column(JSON, nullable=False, default=dict)
    artifact = Column(LargeBinary, nullable=True)
    artifact_storage = Column(
        String(20), nullable=False, default="database", server_default="database"
    )
    artifact_container = Column(String(255), nullable=True)
    artifact_key = Column(String(512), nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0, server_default="0")
    error_code = Column(String(80), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
