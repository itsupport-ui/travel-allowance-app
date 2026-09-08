from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.sql import func

from app.database import Base


class ManualDoctorExpenseReviewEvent(Base):
    __tablename__ = "manual_doctor_expense_review_events"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(
        Integer,
        ForeignKey("doctor_expenses.id"),
        nullable=False,
        index=True,
    )
    event_type = Column(String, nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    revision = Column(Integer, nullable=False)
    submitted_amount = Column(Numeric(12, 2), nullable=False)
    approved_amount = Column(Numeric(12, 2), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
