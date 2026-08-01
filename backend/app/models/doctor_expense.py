from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
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
    fare = Column(Float, nullable=False)
    proof_file = Column(String, nullable=True)
    remarks = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft")
    claim_id = Column(
        Integer,
        ForeignKey("doctor_claims.id"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    claim = relationship(
        "DoctorClaim",
        back_populates="expenses",
    )
