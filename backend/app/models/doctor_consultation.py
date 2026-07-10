from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import (
    DOCTOR_CONSULTATION_PATIENT_DECISION,
    DOCTOR_CONSULTATION_STATUS,
)


class DoctorConsultation(Base):
    __tablename__ = "doctor_consultations"

    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    patient_phone = Column(String, nullable=False)
    patient_address = Column(String, nullable=False)
    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False,
        index=True,
    )
    doctor_visit_id = Column(
        Integer,
        ForeignKey("doctor_visits.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    scheduled_date = Column(Date, nullable=False, index=True)
    scheduled_time = Column(Time, nullable=False)
    purpose = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)
    call_outcome = Column(String, nullable=True)
    preliminary_diagnosis = Column(Text, nullable=True)
    proposed_treatment = Column(Text, nullable=True)
    estimated_amount = Column(Float, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    patient_decision = Column(
        DOCTOR_CONSULTATION_PATIENT_DECISION,
        nullable=False,
        default="pending",
        server_default="pending",
    )
    status = Column(
        DOCTOR_CONSULTATION_STATUS,
        nullable=False,
        default="scheduled",
        server_default="scheduled",
        index=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def visit_id(self):
        return self.doctor_visit_id

    @property
    def has_visit(self):
        return self.doctor_visit_id is not None
