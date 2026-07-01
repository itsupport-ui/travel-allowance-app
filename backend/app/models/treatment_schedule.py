from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class TreatmentSchedule(Base):
    __tablename__ = "treatment_schedules"

    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    therapist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    treatment_name = Column(String, nullable=False)
    medicines = Column(String, nullable=True)
    patient_address = Column(String, nullable=False)
    patient_latitude = Column(Float, nullable=True)
    patient_longitude = Column(Float, nullable=True)
    schedule_type = Column(String, nullable=False)  # e.g., "daily", "weekly", "monthly"
    treatment_date = Column(Date, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    in_time = Column(Time, nullable=True)
    out_time = Column(Time, nullable=True)
    instructions = Column(String, default="Wear face mask and cap during treatment")
    priority = Column(String, default="normal")  # e.g., "normal", "high"
    status = Column(String, default="scheduled")  # e.g., "scheduled", "completed", "cancelled"
    created_at = Column(DateTime, default=datetime.utcnow)
    doctor = relationship("Doctor", backref="treatment_schedules")
    therapist = relationship("User", backref="treatment_schedules")
    completion_notes = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    missed_reason = Column(String, nullable=True)
    transport_mode = Column(String, nullable=False, default="vehicle")
