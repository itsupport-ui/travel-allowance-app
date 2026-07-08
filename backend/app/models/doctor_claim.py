from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DoctorClaim(Base):
    __tablename__ = "doctor_claims"
    __table_args__ = (
        UniqueConstraint(
            "doctor_id",
            "claim_date",
            name="uq_doctor_claims_doctor_date",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False,
        index=True,
    )
    claim_date = Column(Date, nullable=False, index=True)
    total_amount = Column(Float, nullable=False)
    expense_count = Column(Integer, nullable=False)
    status = Column(
        String,
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(String, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    expenses = relationship(
        "DoctorExpense",
        back_populates="claim",
    )
