from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


LocationExceptionTarget = Literal["therapist_schedule", "doctor_visit"]
LocationExceptionAction = Literal["punch_in", "punch_out"]
LocationExceptionStatus = Literal[
    "pending",
    "approved",
    "rejected",
    "used",
    "expired",
]


class LocationExceptionCreate(BaseModel):
    target_type: LocationExceptionTarget
    target_id: int = Field(ge=1)
    action: LocationExceptionAction
    reason: str = Field(min_length=10, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    gps_accuracy_m: float = Field(gt=0, le=5000)
    device_timestamp: datetime


class LocationExceptionDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str = Field(min_length=5, max_length=500)
    version: int = Field(ge=1)


class LocationExceptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    requested_by: int
    requester_name: str | None = None
    staff_role: str
    target_type: LocationExceptionTarget
    target_id: int
    action: LocationExceptionAction
    business_date: date
    reason: str
    captured_latitude: float
    captured_longitude: float
    gps_accuracy_m: float
    device_timestamp: datetime
    distance_km: float | None = None
    geofence_radius_m: float
    location_policy_id: int | None = None
    location_policy_version: int
    gps_accuracy_threshold_m: float
    evidence_max_age_minutes: int
    approval_valid_hours: int
    max_evidence_movement_m: float
    evidence_quality: str
    status: LocationExceptionStatus
    reviewed_by: int | None = None
    reviewer_name: str | None = None
    decision_reason: str | None = None
    requested_at: datetime
    reviewed_at: datetime | None = None
    used_at: datetime | None = None
    version: int
    available_actions: list[str] = Field(default_factory=list)
