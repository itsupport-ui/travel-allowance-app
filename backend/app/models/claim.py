# We need to create a Claim model to represent the travel allowance claims in our application. This model will include fields such as id, employee_id, amount, status, and created_at.
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    JSON,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

class Claim(Base):
    __tablename__ = "claims"
    __table_args__ = (
        UniqueConstraint(
            "therapist_id",
            "claim_date",
            name="uq_claims_therapist_date",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    therapist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    claim_date = Column(Date, nullable=False)
    total_km = Column(Numeric(12, 2), default=0)
    travel_total = Column(Numeric(12, 2), default=0)
    daily_allowance = Column(Numeric(12, 2), default=0)
    grand_total = Column(Numeric(12, 2), default=0)
    patient_visited_today = Column(Boolean, nullable=True)
    status = Column(String, default="pending")
    remarks = Column(String, nullable=True)  # e.g., 'draft', 'approved', 'rejected'
    rejection_reason = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    therapist = relationship(
        "User",
        back_populates="claims",
        foreign_keys=[therapist_id],
    )
    per_km_rate = Column(Numeric(12, 2), default=0)
    policy_id = Column(Integer, ForeignKey("reimbursement_policies.id"), nullable=True)
    calculation_version = Column(String, nullable=False, default="decimal-v1")
    rounding_mode = Column(String, nullable=False, default="ROUND_HALF_UP")
    included_travel_ids = Column(JSON, nullable=True)

    schedule_id = Column(Integer, ForeignKey("treatment_schedules.id"), nullable=True)

    from_address = Column(String, nullable=True)
    to_address = Column(String, nullable=True)
    auto_generated = Column(Boolean, default=False) 
    source_type = Column(String, default="manual")  # 'manual' or 'auto'

    distance_km = Column(Numeric(12, 2), default=0)
    distance_source = Column(String, default="manual")
