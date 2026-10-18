from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DoctorTask(Base):
    """Work assigned to a doctor: clinic training, a patient visit, or other.

    patient_visit tasks wrap a DoctorVisit and are punched through the
    existing visit session endpoints. Other task types are punched in and out
    here against a saved Place.
    """

    __tablename__ = "doctor_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_type = Column(String(30), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    notes = Column(Text, nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False,
        index=True,
    )
    scheduled_date = Column(Date, nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    doctor_visit_id = Column(
        Integer,
        ForeignKey("doctor_visits.id"),
        nullable=True,
        unique=True,
    )
    status = Column(
        String(20),
        nullable=False,
        default="assigned",
        server_default="assigned",
        index=True,
    )
    session_status = Column(
        String(20),
        nullable=False,
        default="NOT_STARTED",
        server_default="NOT_STARTED",
    )
    punch_in_time = Column(DateTime(timezone=True), nullable=True)
    punch_out_time = Column(DateTime(timezone=True), nullable=True)
    punch_in_latitude = Column(Float, nullable=True)
    punch_in_longitude = Column(Float, nullable=True)
    punch_out_latitude = Column(Float, nullable=True)
    punch_out_longitude = Column(Float, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    proof_file = Column(String, nullable=True)
    completion_notes = Column(Text, nullable=True)
    cancel_reason = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    place = relationship("Place")
    doctor_visit = relationship("DoctorVisit")
