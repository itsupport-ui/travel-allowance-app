from datetime import datetime

from pydantic import BaseModel


class PunchInRequest(BaseModel):
    latitude: float
    longitude: float
    device_timestamp: datetime | None = None


class TreatmentSessionResponse(BaseModel):
    schedule_id: int
    therapist_id: int
    schedule_status: str
    session_status: str
    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None
    punch_in_latitude: float | None = None
    punch_in_longitude: float | None = None
    punch_out_latitude: float | None = None
    punch_out_longitude: float | None = None
    treatment_duration: int | None = None
    elapsed_seconds: int = 0
    workday_started: bool
    location_verified: bool | None = None
    can_punch_in: bool
    can_punch_out: bool
    eligibility_message: str | None = None
