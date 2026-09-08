from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LocationPolicyBase(BaseModel):
    geofence_radius_m: float = Field(ge=50, le=1000)
    gps_accuracy_threshold_m: float = Field(ge=10, le=1000)
    evidence_max_age_minutes: int = Field(ge=1, le=60)
    approval_valid_hours: int = Field(ge=1, le=24)
    max_evidence_movement_m: float = Field(ge=25, le=1000)

    @model_validator(mode="after")
    def validate_relative_thresholds(self):
        if self.gps_accuracy_threshold_m > self.geofence_radius_m * 2:
            raise ValueError(
                "GPS accuracy threshold cannot exceed twice the geofence radius"
            )
        return self


class LocationPolicyUpdate(LocationPolicyBase):
    effective_from: date | None = None


class LocationPolicyResponse(LocationPolicyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    effective_from: date
    effective_to: date | None = None
    created_by: int | None = None
    created_at: datetime
