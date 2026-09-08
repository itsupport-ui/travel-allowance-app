from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class TreatmentScheduleSeries(Base):
    __tablename__ = "treatment_schedule_series"

    id = Column(Integer, primary_key=True, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    cadence_days = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default="active")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    occurrences = relationship(
        "TreatmentSchedule",
        back_populates="series",
        order_by="TreatmentSchedule.occurrence_date",
    )
