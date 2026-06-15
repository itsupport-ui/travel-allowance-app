from sqlalchemy import (Column, Integer, String, Float,Boolean, DateTime, ForeignKey)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

class TravelEntry(Base):
    __tablename__ = "travel_entries"

    id = Column(Integer, primary_key=True, index=True)
    therapist_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    travel_date = Column(DateTime, nullable=False)
    from_address = Column(String, nullable=False)
    to_address = Column(String, nullable=False)
    total_km = Column(Float, nullable=False)
    per_km_rate = Column(Float, nullable=False)
    travel_fare = Column(Float, nullable=False)
    patient_visited = Column(Boolean, nullable=False)
    status = Column(String, default="draft")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    therapist = relationship("User", back_populates="travel_entries")
    patient_name = Column(String, nullable=True)
    transport_mode = Column(String, nullable=False, default="Vehicle")  
    bill_amount = Column(Float, nullable=True)
    invoice_file = Column(String, nullable=True)