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
    origin_consultation_id = Column(
        Integer,
        ForeignKey("doctor_consultations.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    successor_consultation_id = Column(
        Integer,
        ForeignKey("doctor_consultations.id"),
        nullable=True,
        unique=True,
        index=True,
    )
    origin_kind = Column(String, nullable=True)
    scheduled_date = Column(Date, nullable=False, index=True)
    scheduled_time = Column(Time, nullable=False)
    purpose = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)
    call_outcome = Column(String, nullable=True)
    preliminary_diagnosis = Column(Text, nullable=True)
    proposed_treatment = Column(Text, nullable=True)
    estimated_amount = Column(Float, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    follow_up_date = Column(Date, nullable=True, index=True)
    follow_up_time = Column(Time, nullable=True)
    follow_up_reason = Column(Text, nullable=True)
    cancellation_code = Column(String, nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    cancelled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
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
    lifecycle_version = Column(Integer, nullable=False, default=1, server_default="1")
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    @property
    def visit_id(self):
        return self.doctor_visit_id

    @property
    def has_visit(self):
        return self.doctor_visit_id is not None

    @property
    def available_actions(self):
        if self.status == "scheduled":
            return ["complete", "reschedule", "cancel"]
        if self.status == "cancelled":
            return (
                ["view_successor"]
                if self.successor_consultation_id is not None
                else []
            )
        if self.doctor_visit_id is not None:
            return ["view_visit"]
        if self.successor_consultation_id is not None:
            return ["view_successor"]
        if self.patient_decision == "confirmed":
            return ["create_visit"]
        if self.patient_decision == "rejected":
            return []
        if self.patient_decision == "follow_up":
            return ["schedule_follow_up", "confirm", "reject"]
        return ["confirm", "reject"]

    @property
    def blocking_reasons(self):
        blockers = []
        if (
            self.status == "completed"
            and self.patient_decision == "follow_up"
            and (self.follow_up_date is None or self.follow_up_time is None)
        ):
            blockers.append("FOLLOW_UP_SCHEDULE_REQUIRED")
        if self.successor_consultation_id is not None:
            blockers.append("CONSULTATION_HAS_SUCCESSOR")
        if self.doctor_visit_id is not None:
            blockers.append("CONSULTATION_ALREADY_CONVERTED")
        return blockers

    @property
    def next_action(self):
        actions = self.available_actions
        return actions[0] if actions else None
