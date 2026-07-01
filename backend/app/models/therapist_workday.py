from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    Date,
    DateTime,
    Boolean,
    ForeignKey
)

from sqlalchemy.sql import func
from app.database import Base


class TherapistWorkDay(Base):
    __tablename__ = "therapist_work_days"

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