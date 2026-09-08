from sqlalchemy import (
    Column,
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


class StaffDeactivationOverride(Base):
    __tablename__ = "staff_deactivation_overrides"
    __table_args__ = (
        Index(
            "ix_staff_deactivation_overrides_subject",
            "subject_role",
            "subject_id",
        ),
        Index(
            "uq_staff_deactivation_overrides_active_key",
            "active_key",
            unique=True,
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_code = Column(
        String(80),
        nullable=False,
        default="STAFF_DEACTIVATION_WITH_OPEN_IMPACTS",
        server_default="STAFF_DEACTIVATION_WITH_OPEN_IMPACTS",
        index=True,
    )
    subject_role = Column(String(20), nullable=False, index=True)
    subject_id = Column(Integer, nullable=False, index=True)
    requested_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    request_reason = Column(Text, nullable=False)
    evidence_refs = Column(JSON, nullable=False, default=list)
    captured_conditions = Column(JSON, nullable=False, default=dict)
    condition_fingerprint = Column(String(64), nullable=False)
    before_state = Column(JSON, nullable=False, default=dict)
    after_state = Column(JSON, nullable=True)
    status = Column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )
    active_key = Column(String(160), nullable=True)
    decided_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    decision_reason = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
