from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class LocationExceptionRequest(Base):
    __tablename__ = "location_exception_requests"
    __table_args__ = (
        CheckConstraint(
            "(schedule_id IS NOT NULL AND doctor_visit_id IS NULL) OR "
            "(schedule_id IS NULL AND doctor_visit_id IS NOT NULL)",
            name="ck_location_exception_exactly_one_target",
        ),
        UniqueConstraint(
            "active_key",
            name="uq_location_exception_active_key",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    requested_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    staff_role = Column(String(20), nullable=False, index=True)
    schedule_id = Column(
        Integer,
        ForeignKey("treatment_schedules.id"),
        nullable=True,
        index=True,
    )
    doctor_visit_id = Column(
        Integer,
        ForeignKey("doctor_visits.id"),
        nullable=True,
        index=True,
    )
    action = Column(String(20), nullable=False, index=True)
    business_date = Column(Date, nullable=False, index=True)
    reason = Column(Text, nullable=False)
    captured_latitude = Column(Float, nullable=False)
    captured_longitude = Column(Float, nullable=False)
    gps_accuracy_m = Column(Float, nullable=False)
    device_timestamp = Column(DateTime(timezone=True), nullable=False)
    distance_km = Column(Float, nullable=True)
    geofence_radius_m = Column(Float, nullable=False)
    evidence_quality = Column(String(20), nullable=False)
    location_policy_id = Column(
        Integer,
        ForeignKey("location_policies.id"),
        nullable=True,
        index=True,
    )
    location_policy_version = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    gps_accuracy_threshold_m = Column(
        Float,
        nullable=False,
        default=250.0,
        server_default="250",
    )
    evidence_max_age_minutes = Column(
        Integer,
        nullable=False,
        default=15,
        server_default="15",
    )
    approval_valid_hours = Column(
        Integer,
        nullable=False,
        default=8,
        server_default="8",
    )
    max_evidence_movement_m = Column(
        Float,
        nullable=False,
        default=250.0,
        server_default="250",
    )
    status = Column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )
    active_key = Column(String(160), nullable=True)
    reviewed_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    decision_reason = Column(Text, nullable=True)
    requested_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
