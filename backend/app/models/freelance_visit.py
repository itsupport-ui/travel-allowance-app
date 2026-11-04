from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class FreelanceVisit(Base):
    """A single paid patient visit done by a freelance therapist via a link."""

    __tablename__ = "freelance_visits"

    id = Column(Integer, primary_key=True, index=True)
    freelancer_id = Column(
        Integer,
        ForeignKey("freelance_therapists.id"),
        nullable=False,
        index=True,
    )
    patient_name = Column(String(150), nullable=False)
    patient_phone = Column(String(20), nullable=True)
    patient_address = Column(String, nullable=False)
    patient_latitude = Column(Float, nullable=True)
    patient_longitude = Column(Float, nullable=True)
    treatment_name = Column(String(200), nullable=False)
    instructions = Column(Text, nullable=True)
    visit_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=True)
    treatment_plan_id = Column(
        Integer,
        ForeignKey("treatment_plans.id"),
        nullable=True,
    )

    fee_amount = Column(Numeric(10, 2), nullable=False)
    # assigned, in_progress, completed, approved, paid, cancelled
    status = Column(
        String(20),
        nullable=False,
        default="assigned",
        server_default="assigned",
        index=True,
    )

    # Only the SHA-256 of the link token is stored.
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=False)

    punch_in_time = Column(DateTime(timezone=True), nullable=True)
    punch_in_latitude = Column(Float, nullable=True)
    punch_in_longitude = Column(Float, nullable=True)
    punch_in_accuracy_m = Column(Float, nullable=True)
    punch_out_time = Column(DateTime(timezone=True), nullable=True)
    punch_out_latitude = Column(Float, nullable=True)
    punch_out_longitude = Column(Float, nullable=True)
    punch_out_accuracy_m = Column(Float, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    location_unverified = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )
    unverified_reason = Column(Text, nullable=True)
    proof_file = Column(String, nullable=True)
    completion_notes = Column(Text, nullable=True)
    cancel_reason = Column(Text, nullable=True)

    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    paid_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    payment_reference = Column(String(100), nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    freelancer = relationship("FreelanceTherapist")
