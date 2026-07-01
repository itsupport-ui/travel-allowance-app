from datetime import date, datetime

from pydantic import BaseModel


class StartDayRequest(BaseModel):
    start_address: str
    start_latitude: float
    start_longitude: float


class StartDayResponse(BaseModel):
    message: str
    workday_id: int


class TodayWorkdayResponse(BaseModel):
    started: bool
    workday_id: int | None = None
    work_date: date
    started_at: datetime | None = None
    start_address: str | None = None
    is_active: bool = False
