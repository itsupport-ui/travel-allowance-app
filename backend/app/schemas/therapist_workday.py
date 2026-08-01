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
    ended_at: datetime | None = None
    total_work_minutes: int | None = None
    pending_schedules_count: int | None = None
    completed_schedules_count: int | None = None
    missed_schedules_count: int | None = None
    workday_end_time: str
    can_end_workday: bool = False
    should_prompt_end: bool = False
    auto_logout_enabled: bool = False
    auto_logout_grace_minutes: int = 0


class EndDayRequest(BaseModel):
    end_latitude: float
    end_longitude: float
    device_timestamp: datetime | None = None


class EndDayResponse(BaseModel):
    message: str
    workday_id: int
    ended_at: datetime
    total_work_minutes: int
    pending_schedules_count: int
    completed_schedules_count: int
    missed_schedules_count: int
