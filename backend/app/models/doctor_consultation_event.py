from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class DoctorConsultationEvent(Base):
    __tablename__ = "doctor_consultation_events"

    id = Column(Integer, primary_key=True, index=True)
    consultation_id = Column(
        Integer,
        ForeignKey("doctor_consultations.id"),
        nullable=False,
        index=True,
    )
    event_type = Column(String, nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=True)
    from_decision = Column(String, nullable=True)
    to_decision = Column(String, nullable=True)
    reason = Column(Text, nullable=True)
    related_consultation_id = Column(
        Integer,
        ForeignKey("doctor_consultations.id"),
        nullable=True,
    )
    related_visit_id = Column(
        Integer,
        ForeignKey("doctor_visits.id"),
        nullable=True,
    )
    lifecycle_version = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
