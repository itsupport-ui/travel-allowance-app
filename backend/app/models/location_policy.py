from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer
from sqlalchemy.sql import func

from app.database import Base


class LocationPolicy(Base):
    __tablename__ = "location_policies"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(Integer, nullable=False, unique=True, index=True)
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    geofence_radius_m = Column(Float, nullable=False)
    gps_accuracy_threshold_m = Column(Float, nullable=False)
    evidence_max_age_minutes = Column(Integer, nullable=False)
    approval_valid_hours = Column(Integer, nullable=False)
    max_evidence_movement_m = Column(Float, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
