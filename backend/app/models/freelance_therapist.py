from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class FreelanceTherapist(Base):
    """A per-visit hired therapist. Identified by mobile number, no login."""

    __tablename__ = "freelance_therapists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    # Normalised to the 10-digit national number.
    phone = Column(String(15), nullable=False, unique=True, index=True)
    upi_id = Column(String(100), nullable=True)
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
