from sqlalchemy import (Column, Integer, Float, DateTime)

from sqlalchemy.sql import func
from app.database import Base

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    per_km_rate = Column(Float, default=3)
    daily_allowance = Column(Float, default=150)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
