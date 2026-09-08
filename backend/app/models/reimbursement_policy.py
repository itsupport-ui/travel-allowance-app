from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.sql import func

from app.database import Base


class ReimbursementPolicy(Base):
    __tablename__ = "reimbursement_policies"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(Integer, nullable=False, unique=True, index=True)
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    per_km_rate = Column(Numeric(12, 2), nullable=False)
    daily_allowance = Column(Numeric(12, 2), nullable=False)
    doctor_receipt_threshold = Column(
        Numeric(12, 2), nullable=False, default=500, server_default="500.00"
    )
    rounding_mode = Column(
        String,
        nullable=False,
        default="ROUND_HALF_UP",
        server_default="ROUND_HALF_UP",
    )
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
