# We need to create a Claim model to represent the travel allowance claims in our application. This model will include fields such as id, employee_id, amount, status, and created_at.
from sqlalchemy import Column, Integer, Float, String, Boolean, Date, DateTime, ForeignKey

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base
from sqlalchemy import Boolean

class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True)
    therapist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    claim_date = Column(Date, nullable=False)
    total_km = Column(Float, default=0)
    travel_total = Column(Float, default=0)
    daily_allowance = Column(Float, default=0)
    grand_total = Column(Float, default=0)
    patient_visited_today = Column(String, nullable=True)
    status = Column(String, default="pending")
    remarks = Column(String, nullable=True)  # e.g., 'draft', 'approved', 'rejected'
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    therapist = relationship("User", back_populates="claims")
    per_km_rate = Column(Float, default=0)  # New field for per km fare

    schedule_id = Column(Integer, ForeignKey("treatment_schedules.id"), nullable=True)

    from_address = Column(String, nullable=True)
    to_address = Column(String, nullable=True)
    auto_generated = Column(Boolean, default=False) 
    source_type = Column(String, default="manual")  # 'manual' or 'auto'

    distance_km = Column(Float, default=0)
    distance_source = Column(String, default="manual")