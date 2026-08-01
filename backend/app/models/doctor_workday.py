from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class DoctorWorkDay(Base):
    __tablename__ = "doctor_work_days"
    __table_args__ = (
        UniqueConstraint(
            "doctor_id",
            "work_date",
            name="uq_doctor_work_days_doctor_date",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False,
        index=True,
    )
    work_date = Column(Date, nullable=False, index=True)
    start_address = Column(String, nullable=True)
    start_latitude = Column(Float, nullable=False)
    start_longitude = Column(Float, nullable=False)
    started_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    is_active = Column(Boolean, nullable=False, default=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    end_address = Column(String, nullable=True)
    end_latitude = Column(Float, nullable=True)
    end_longitude = Column(Float, nullable=True)
    total_work_minutes = Column(Integer, nullable=True)
    total_visits_count = Column(Integer, nullable=True)
    completed_visits_count = Column(Integer, nullable=True)
    pending_visits_count = Column(Integer, nullable=True)
    total_distance_km = Column(Float, nullable=True)
