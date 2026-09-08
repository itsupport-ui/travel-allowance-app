from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.sql import func

from app.database import Base


class ReportExportEvent(Base):
    __tablename__ = "report_export_events"

    id = Column(String(36), primary_key=True)
    requested_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    snapshot_id = Column(String(36), nullable=True, index=True)
    export_job_id = Column(String(36), nullable=True, index=True)
    report_type = Column(String, nullable=True, index=True)
    scope = Column(String, nullable=True, index=True)
    format = Column(String, nullable=True)
    event_type = Column(String, nullable=False, index=True)
    outcome = Column(String, nullable=False, index=True)
    error_code = Column(String, nullable=True, index=True)
    details = Column(JSON, nullable=False, default=dict)
    occurred_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
