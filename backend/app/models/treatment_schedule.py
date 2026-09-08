from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class TreatmentSchedule(Base):
    __tablename__ = "treatment_schedules"
    __table_args__ = (
        UniqueConstraint(
            "series_id",
            "occurrence_date",
            name="uq_treatment_schedule_series_occurrence",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    patient_reference_id = Column(String, nullable=True)
    patient_phone = Column(String(20), nullable=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    therapist_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    treatment_name = Column(String, nullable=False)
    visit_type = Column(
        String,
        nullable=False,
        default="home_visit",
        server_default="home_visit",
    )
    medicines = Column(String, nullable=True)
    patient_address = Column(String, nullable=False)
    patient_latitude = Column(Float, nullable=True)
    patient_longitude = Column(Float, nullable=True)
    schedule_type = Column(String, nullable=False)  # e.g., "daily", "weekly", "monthly"
    treatment_date = Column(Date, nullable=True, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    in_time = Column(Time, nullable=True)
    out_time = Column(Time, nullable=True)
    instructions = Column(String, default="Wear face mask and cap during treatment")
    clinical_notes = Column(String, nullable=True)
    precautions = Column(String, nullable=True)
    priority = Column(String, default="normal")  # e.g., "normal", "high"
    status = Column(String, default="scheduled", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    doctor = relationship("Doctor", backref="treatment_schedules")
    therapist = relationship("User", backref="treatment_schedules")
    completion_notes = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    missed_reason = Column(String, nullable=True)
    punch_in_time = Column(DateTime(timezone=True), nullable=True)
    punch_out_time = Column(DateTime(timezone=True), nullable=True)
    punch_in_latitude = Column(Float, nullable=True)
    punch_in_longitude = Column(Float, nullable=True)
    punch_out_latitude = Column(Float, nullable=True)
    punch_out_longitude = Column(Float, nullable=True)
    treatment_duration = Column(Integer, nullable=True)
    session_status = Column(
        String,
        nullable=False,
        default="NOT_STARTED",
        server_default="NOT_STARTED",
        index=True,
    )
    # Legacy storage retained for existing deployments. Scheduling no longer
    # reads or writes transport; therapists choose it when completing a visit.
    transport_mode = Column(String, nullable=False, default="vehicle")
    treatment_plan_id = Column(
        Integer,
        ForeignKey("treatment_plans.id"),
        nullable=True,
        index=True,
    )
    treatment_plan = relationship(
        "TreatmentPlan",
        back_populates="treatment_schedules",
    )
    series_id = Column(
        Integer,
        ForeignKey("treatment_schedule_series.id"),
        nullable=True,
        index=True,
    )
    occurrence_date = Column(Date, nullable=True, index=True)
    series = relationship(
        "TreatmentScheduleSeries",
        back_populates="occurrences",
    )
