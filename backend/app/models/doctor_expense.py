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
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class DoctorExpense(Base):
    __tablename__ = "doctor_expenses"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False,
        index=True,
    )
    expense_date = Column(Date, nullable=False, index=True)
    workday_id = Column(
        Integer,
        ForeignKey("doctor_work_days.id"),
        nullable=True,
        index=True,
    )
    visit_id = Column(
        Integer,
        ForeignKey("doctor_visits.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    from_waypoint_id = Column(
        Integer,
        ForeignKey("doctor_travel_waypoints.id"),
        nullable=True,
    )
    to_waypoint_id = Column(
        Integer,
        ForeignKey("doctor_travel_waypoints.id"),
        nullable=True,
    )
    from_location = Column(String, nullable=False)
    to_location = Column(String, nullable=False)
    from_latitude = Column(Float, nullable=True)
    from_longitude = Column(Float, nullable=True)
    to_latitude = Column(Float, nullable=True)
    to_longitude = Column(Float, nullable=True)
    distance_km = Column(Float, nullable=True)
    transport_mode = Column(String, nullable=False)
    fare = Column(Numeric(12, 2), nullable=False)
    approved_amount = Column(Numeric(12, 2), nullable=True)
    proof_file = Column(String, nullable=True)
    remarks = Column(String, nullable=True)
    expense_category = Column(
        String,
        nullable=False,
        default="public_transport",
        server_default="public_transport",
    )
    manual_reason = Column(Text, nullable=True)
    manual_review_status = Column(String, nullable=True, index=True)
    manual_reviewed_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    manual_review_reason = Column(Text, nullable=True)
    manual_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    manual_revision = Column(Integer, nullable=False, default=1, server_default="1")
    manual_review_version = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    policy_id = Column(
        Integer,
        ForeignKey("reimbursement_policies.id"),
        nullable=True,
    )
    rate_applied = Column(Numeric(12, 2), nullable=True)
    receipt_threshold_applied = Column(Numeric(12, 2), nullable=True)
    receipt_required = Column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    calculation_version = Column(
        String,
        nullable=False,
        default="decimal-v1",
        server_default="decimal-v1",
    )
    rounding_mode = Column(
        String,
        nullable=False,
        default="ROUND_HALF_UP",
        server_default="ROUND_HALF_UP",
    )
    status = Column(String, nullable=False, default="draft")
    claim_id = Column(
        Integer,
        ForeignKey("doctor_claims.id"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
        onupdate=func.now(),
    )
    claim = relationship(
        "DoctorClaim",
        back_populates="expenses",
    )
