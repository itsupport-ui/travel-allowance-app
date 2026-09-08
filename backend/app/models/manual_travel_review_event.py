from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class ManualTravelReviewEvent(Base):
    __tablename__ = "manual_travel_review_events"

    id = Column(Integer, primary_key=True, index=True)
    travel_id = Column(
        Integer,
        ForeignKey("travel_entries.id"),
        nullable=False,
        index=True,
    )
    event_type = Column(String, nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    revision = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
