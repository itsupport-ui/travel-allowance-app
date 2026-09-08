from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
)
from sqlalchemy.sql import func

from app.database import Base


class ReportSnapshot(Base):
    __tablename__ = "report_snapshots"

    id = Column(String(36), primary_key=True)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    report_type = Column(String, nullable=False, index=True)
    scope = Column(String, nullable=False)
    filters = Column(JSON, nullable=False)
    rows = Column(JSON, nullable=False)
    row_count = Column(Integer, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    summary = Column(JSON, nullable=False, default=dict)
    snapshot_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
