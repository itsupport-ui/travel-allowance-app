from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.uploads import public_upload_name



class ClaimResponse(BaseModel):
    id: int
    claim_date: date
    total_km: float
    travel_total: float
    daily_allowance: float
    grand_total: float
    patient_visited_today: bool | None = None
    status: str
    therapist_name: str | None = None
    patient_count: int | None = 0
    per_km_rate: float | None = 0
    rejection_reason: str | None = None
    reviewed_at: datetime | None = None
    reviewed_by: int | None = None
    revision: int = 1
    policy_id: int | None = None
    calculation_version: str = "decimal-v1"
    rounding_mode: str = "ROUND_HALF_UP"
    included_travel_ids: list[int] | None = None

    model_config = ConfigDict(from_attributes=True)


class ClaimDetailsClaimResponse(BaseModel):
    id: int
    therapist_id: int
    therapist_name: str | None = None
    therapist_role: str | None = None
    claim_date: date
    submitted_at: datetime | None = None
    total_km: float
    per_km_rate: float | None = 0
    travel_total: float
    daily_allowance: float
    grand_total: float
    status: str
    notes: str | None = None
    patient_count: int = 0
    rejection_reason: str | None = None
    reviewed_at: datetime | None = None
    reviewed_by: int | None = None
    revision: int = 1


class ClaimTravelEntryResponse(BaseModel):
    id: int
    travel_date: date
    travel_timestamp: datetime | None = None
    patient_name: str | None = None
    transport_mode: str
    bill_amount: float | None = None
    invoice_file: str | None = None
    from_address: str
    to_address: str
    total_km: float
    per_km_rate: float
    travel_fare: float
    patient_visited: bool
    status: str

    @field_validator("invoice_file", mode="before")
    @classmethod
    def serialize_invoice_name(cls, value) -> str | None:
        return public_upload_name(value, "invoice")


class ClaimDetailsResponse(BaseModel):
    claim: ClaimDetailsClaimResponse
    travels: list[ClaimTravelEntryResponse]


class ClaimRejectRequest(BaseModel):
    rejection_reason: str = Field(min_length=1, max_length=500)

    @field_validator("rejection_reason")
    @classmethod
    def validate_rejection_reason(cls, value: str) -> str:
        reason = value.strip()
        if not reason:
            raise ValueError("Rejection reason is required")
        return reason
