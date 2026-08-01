from datetime import date, datetime

from pydantic import BaseModel


class DoctorStartDayRequest(BaseModel):
    start_address: str
    start_latitude: float
    start_longitude: float
    device_timestamp: datetime | None = None


class DoctorEndDayRequest(BaseModel):
    end_address: str | None = None
    end_latitude: float
    end_longitude: float
    device_timestamp: datetime | None = None


class DoctorTodayWorkdayResponse(BaseModel):
    started: bool
    workday_id: int | None = None
    work_date: date
    started_at: datetime | None = None
    start_address: str | None = None
    start_latitude: float | None = None
    start_longitude: float | None = None
    is_active: bool
    ended_at: datetime | None = None
    total_work_minutes: int | None = None
    total_visits_count: int | None = None
    completed_visits_count: int | None = None
    pending_visits_count: int | None = None
    total_distance_km: float | None = None
    workday_end_time: str
    can_end_workday: bool
    should_prompt_end: bool
    auto_logout_enabled: bool
    auto_logout_grace_minutes: int


class DoctorStartDayResponse(BaseModel):
    message: str
    workday_id: int


class DoctorEndDayResponse(BaseModel):
    message: str
    workday_id: int
    ended_at: datetime
    total_work_minutes: int
    total_visits_count: int
    completed_visits_count: int
    pending_visits_count: int
    total_distance_km: float


class DoctorTravelWaypointResponse(BaseModel):
    id: int
    workday_id: int
    visit_id: int | None = None
    waypoint_type: str
    sequence_number: int
    address: str | None = None
    latitude: float
    longitude: float
    recorded_at: datetime
    distance_from_previous_km: float | None = None
    expense_id: int | None = None
