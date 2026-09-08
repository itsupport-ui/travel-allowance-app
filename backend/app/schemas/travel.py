from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import date, datetime
from typing import Literal

from app.utils.uploads import public_upload_name


class TravelCreate(BaseModel):
    travel_date: date
    from_address: str
    to_address: str
    total_km: float
    patient_visited: bool
    patient_name: str | None = None
    transport_mode: str | None = "Vehicle"
      # e.g., car, bus, train, etc.
    bill_amount: float | None = None    

class TravelResponse(BaseModel):
    id: int
    therapist_id: int
    therapist_name: str | None = None
    travel_date: date
    from_address: str
    to_address: str
    total_km: float
    per_km_rate: float
    travel_fare: float
    patient_visited: bool
    status: str
    claim_id: int | None = None
    patient_name: str | None = None
    transport_mode: str # e.g., car, bus, train, etc.
    bill_amount: float | None = None
    invoice_file: str | None = None
    schedule_id: int | None = None
    policy_id: int | None = None
    calculation_version: str = "decimal-v1"
    rounding_mode: str = "ROUND_HALF_UP"
    arrival_latitude: float | None = None
    arrival_longitude: float | None = None
    manual_reason: str | None = None
    manual_review_status: str | None = None
    manual_review_reason: str | None = None
    manual_revision: int = 1
    manual_review_version: int = 1
    available_actions: list[str] = Field(default_factory=list)

    @field_validator("invoice_file", mode="before")
    @classmethod
    def serialize_invoice_name(cls, value) -> str | None:
        return public_upload_name(value, "invoice")
    
    model_config = ConfigDict(from_attributes=True)

class TravelUpdate(BaseModel):
    travel_date: date
    from_address: str
    to_address: str
    total_km: float
    patient_visited: bool
    patient_name: str | None = None
    transport_mode: str | None = None # e.g., car, bus, train, etc.
    bill_amount: float | None = None
    invoice_file: str | None = None


class ManualTravelDecision(BaseModel):
    decision: Literal["approved", "changes_requested"]
    reason: str = Field(min_length=5, max_length=500)
    version: int = Field(ge=1)


class ManualTravelReviewEventResponse(BaseModel):
    id: int
    event_type: str
    actor_id: int
    actor_name: str | None = None
    from_status: str | None = None
    to_status: str
    reason: str
    revision: int
    created_at: datetime
