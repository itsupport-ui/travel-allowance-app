from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class ReportExportAudit(Base):
    __tablename__ = "report_export_audits"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_id",
            "requested_by",
            "format",
            name="uq_report_export_audit_snapshot_requester_format",
        ),
    )

    id = Column(String(36), primary_key=True)
    snapshot_id = Column(String(36), nullable=False, index=True)
    requested_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    report_type = Column(String, nullable=False, index=True)
    scope = Column(String, nullable=False, index=True)
    format = Column(String, nullable=False)
    filters = Column(JSON, nullable=False)
    row_count = Column(Integer, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    summary = Column(JSON, nullable=False, default=dict)
    snapshot_at = Column(DateTime(timezone=True), nullable=False)
    snapshot_expires_at = Column(DateTime(timezone=True), nullable=False)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    checksum_sha256 = Column(String(64), nullable=False)
    download_count = Column(Integer, nullable=False, default=1)
    first_generated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_downloaded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
