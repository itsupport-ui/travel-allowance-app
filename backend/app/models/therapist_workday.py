from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
)

from sqlalchemy.sql import func
from app.database import Base


class TherapistWorkDay(Base):
    __tablename__ = "therapist_work_days"
    __table_args__ = (
        Index(
            "uq_therapist_work_days_therapist_date",
            "therapist_id",
            "work_date",
            unique=True,
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    therapist_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    work_date = Column(Date, nullable=False)

    start_address = Column(String, nullable=True)

    start_latitude = Column(Float, nullable=True)
    start_longitude = Column(Float, nullable=True)

    started_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    is_active = Column(Boolean, default=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    ended_early = Column(Boolean, nullable=False, default=False)
    end_reason = Column(String, nullable=True)
    early_end_review_status = Column(String, nullable=True, index=True)
    early_end_reviewed_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    early_end_review_reason = Column(String, nullable=True)
    early_end_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    early_end_review_version = Column(Integer, nullable=False, default=1)
    end_latitude = Column(Float, nullable=True)
    end_longitude = Column(Float, nullable=True)
    total_work_minutes = Column(Integer, nullable=True)
    pending_schedules_count = Column(Integer, nullable=True)
    completed_schedules_count = Column(Integer, nullable=True)
    missed_schedules_count = Column(Integer, nullable=True)
