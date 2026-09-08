from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
from app.models.doctor_visit import DoctorVisit
from app.models.doctor import Doctor
from app.models.enums import TREATMENT_PLAN_STATUS

class TreatmentPlan(Base):
    __tablename__ = "treatment_plans"
    __table_args__ = (
        UniqueConstraint(
            "doctor_visit_id",
            name="uq_treatment_plans_doctor_visit_id",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    doctor_visit_id = Column(Integer, ForeignKey("doctor_visits.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    patient_name = Column(String, nullable=False)
    diagnosis = Column(String, nullable=True)
    chief_complaint = Column(String, nullable=True)
    treatment_plan = Column(String, nullable=True)
    medicines = Column(String, nullable=True)
    sessions_required = Column(Integer, nullable=True)
    frequency = Column(String, nullable=True)
    duration = Column(String, nullable=True)
    special_instructions = Column(String, nullable=True)
    remarks = Column(String, nullable=True)
    status = Column(TREATMENT_PLAN_STATUS, default="pending")
    rejection_reason = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    revision = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    treatment_schedules = relationship(
        "TreatmentSchedule",
        back_populates="treatment_plan",
    )

    @property
    def schedule_count(self):
        return len(self.treatment_schedules or [])

    @property
    def has_schedule(self):
        return self.schedule_count > 0
