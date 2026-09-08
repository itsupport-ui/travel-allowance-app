from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.sql import func

from app.database import Base


class OperationalFollowUp(Base):
    __tablename__ = "operational_follow_ups"
    __table_args__ = (
        Index("ix_operational_follow_ups_queue", "status", "due_date"),
        Index(
            "ix_operational_follow_ups_source",
            "source_domain",
            "source_entity_type",
            "source_entity_id",
        ),
        Index(
            "uq_operational_follow_ups_active_source",
            "source_domain",
            "source_entity_type",
            "source_entity_id",
            unique=True,
            sqlite_where=text("status IN ('open', 'in_progress')"),
            postgresql_where=text("status IN ('open', 'in_progress')"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    source_domain = Column(String(50), nullable=False, index=True)
    source_entity_type = Column(String(80), nullable=False)
    source_entity_id = Column(String(100), nullable=False)
    title = Column(String(160), nullable=False)
    priority = Column(String(20), nullable=False, default="medium")
    status = Column(String(20), nullable=False, default="open", index=True)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    due_date = Column(Date, nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_reason = Column(Text, nullable=False)
    resolution = Column(Text, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
