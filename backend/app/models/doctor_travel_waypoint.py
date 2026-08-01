from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class DoctorTravelWaypoint(Base):
    __tablename__ = "doctor_travel_waypoints"
    __table_args__ = (
        UniqueConstraint(
            "workday_id",
            "sequence_number",
            name="uq_doctor_waypoints_workday_sequence",
        ),
        UniqueConstraint(
            "workday_id",
            "visit_id",
            name="uq_doctor_waypoints_workday_visit",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False,
        index=True,
    )
    workday_id = Column(
        Integer,
        ForeignKey("doctor_work_days.id"),
        nullable=False,
        index=True,
    )
    visit_id = Column(
        Integer,
        ForeignKey("doctor_visits.id"),
        nullable=True,
        index=True,
    )
    waypoint_type = Column(String, nullable=False)
    sequence_number = Column(Integer, nullable=False)
    address = Column(String, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    recorded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    distance_from_previous_km = Column(Float, nullable=True)
