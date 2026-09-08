# crete tablename : users, columns, id, name, email, password_hash, role, is_active, created_at, updated_at
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String
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
    travel_entries = relationship(
        "TravelEntry",
        back_populates="therapist",
        foreign_keys="TravelEntry.therapist_id",
    )
    claims = relationship(
        "Claim",
        back_populates="therapist",
        foreign_keys="Claim.therapist_id",
    )
    push_tokens = relationship(
        "PushToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    base_location = Column(String, nullable=True)  # New field for therapist's base location
    created_visits = relationship("DoctorVisit", back_populates="creator")  # Relationship to DoctorVisit
    __table_args__ = (
        Index(
            "uq_users_username_lower",
            func.lower(username),
            unique=True,
        ),
    )
