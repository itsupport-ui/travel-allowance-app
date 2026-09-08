from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.database import Base


class DomainAuditEvent(Base):
    __tablename__ = "domain_audit_events"
    __table_args__ = (
        Index(
            "ix_domain_audit_events_entity",
            "entity_type",
            "entity_id",
        ),
        Index(
            "ix_domain_audit_events_domain_occurred",
            "domain",
            "occurred_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=False, index=True)
    entity_id = Column(String, nullable=False)
    action = Column(String, nullable=False, index=True)
    outcome = Column(String, nullable=False, default="success", server_default="success")
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    actor_role = Column(String, nullable=False)
    business_date = Column(Date, nullable=False, index=True)
    from_state = Column(String, nullable=True)
    to_state = Column(String, nullable=True)
    reason_code = Column(String, nullable=True, index=True)
    reason = Column(Text, nullable=True)
    related_entity_type = Column(String, nullable=True)
    related_entity_id = Column(String, nullable=True)
    correlation_id = Column(String, nullable=True, index=True)
    details = Column(JSON, nullable=False, default=dict)
    occurred_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
