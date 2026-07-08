from datetime import date

from pydantic import BaseModel, field_validator

from app.utils.uploads import public_upload_name



class ClaimResponse(BaseModel):
    id: int
    claim_date: date
    total_km: float
    travel_total: float
    daily_allowance: float
    grand_total: float
    patient_visited_today: str | None = None
    status: str
    therapist_name: str | None = None
    patient_count: int | None = 0
    per_km_rate: float | None = 0

    class Config:
        from_attributes = True


class ClaimDetailsClaimResponse(BaseModel):
    id: int
    therapist_name: str | None = None
    claim_date: date
    total_km: float
    per_km_rate: float | None = 0
    travel_total: float
    daily_allowance: float
    grand_total: float
    status: str


class ClaimTravelEntryResponse(BaseModel):
    id: int
    travel_date: date
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
