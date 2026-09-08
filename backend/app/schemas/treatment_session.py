from datetime import datetime

from pydantic import BaseModel, Field


class PunchInRequest(BaseModel):
    latitude: float
    longitude: float
    gps_accuracy_m: float | None = Field(default=None, gt=0, le=5000)
    location_exception_id: int | None = None
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
    location_exception_id: int | None = None
    location_exception_status: str | None = None
    can_request_location_exception: bool = False
    location_policy_version: int | None = None
    geofence_radius_m: float | None = None
    gps_accuracy_threshold_m: float | None = None
