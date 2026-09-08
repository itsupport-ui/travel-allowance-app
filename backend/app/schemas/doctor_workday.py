from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


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
    early_end_reason: str | None = Field(default=None, max_length=500)

    @field_validator("early_end_reason")
    @classmethod
    def normalize_early_end_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        if len(normalized) < 5:
            raise ValueError("Early end reason must be at least 5 characters")
        return normalized


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
    available_actions: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)
    next_action: str | None = None
    active_visit_id: int | None = None
    ended_early: bool = False
    end_reason: str | None = None
    early_end_review_status: str | None = None


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
    ended_early: bool = False
    end_reason: str | None = None
    early_end_review_status: str | None = None


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
