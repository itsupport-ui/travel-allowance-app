from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class Place(Base):
    """A saved location (clinic or other site) that doctor tasks happen at."""

    __tablename__ = "places"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    place_type = Column(
        String(30),
        nullable=False,
        default="clinic",
        server_default="clinic",
    )
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    # NULL means "use the effective location policy radius".
    radius_m = Column(Float, nullable=True)
    active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default="1",
    )
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
