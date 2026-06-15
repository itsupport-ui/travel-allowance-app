# crete tablename : users, columns, id, name, email, password_hash, role, is_active, created_at, updated_at
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func

from app.database import Base
from sqlalchemy.orm import relationship

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # e.g., 'employee', 'manager'
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    travel_entries = relationship("TravelEntry", back_populates="therapist")
    claims = relationship("Claim", back_populates="therapist")
