from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

class TravelEntry(Base):
    __tablename__ = "travel_entries"
    __table_args__ = (
        UniqueConstraint(
            "therapist_id",
            "schedule_id",
            name="uq_travel_entries_therapist_schedule",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    therapist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    travel_date = Column(DateTime, nullable=False)
    from_address = Column(String, nullable=False)
    to_address = Column(String, nullable=False)
    total_km = Column(Numeric(12, 2), nullable=False)
    per_km_rate = Column(Numeric(12, 2), nullable=False)
    travel_fare = Column(Numeric(12, 2), nullable=False)
    policy_id = Column(Integer, ForeignKey("reimbursement_policies.id"), nullable=True)
    calculation_version = Column(String, nullable=False, default="decimal-v1")
    rounding_mode = Column(String, nullable=False, default="ROUND_HALF_UP")
    patient_visited = Column(Boolean, nullable=False)
    status = Column(String, default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
        onupdate=func.now(),
    )
    therapist = relationship(
        "User",
        back_populates="travel_entries",
        foreign_keys=[therapist_id],
    )
    patient_name = Column(String, nullable=True)
    transport_mode = Column(String, nullable=False, default="Vehicle")  
    bill_amount = Column(Numeric(12, 2), nullable=True)
    invoice_file = Column(String, nullable=True)
    schedule_id = Column(Integer, ForeignKey("treatment_schedules.id"), nullable=True)
    arrival_latitude = Column(Float, nullable=True)
    arrival_longitude = Column(Float, nullable=True)
    manual_reason = Column(String, nullable=True)
    manual_review_status = Column(String, nullable=True, index=True)
    manual_reviewed_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    manual_review_reason = Column(String, nullable=True)
    manual_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    manual_revision = Column(Integer, nullable=False, default=1)
    manual_review_version = Column(Integer, nullable=False, default=1)
