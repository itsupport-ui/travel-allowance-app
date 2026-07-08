from pydantic import BaseModel, field_validator
from datetime import date

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
    arrival_latitude: float | None = None
    arrival_longitude: float | None = None

    @field_validator("invoice_file", mode="before")
    @classmethod
    def serialize_invoice_name(cls, value) -> str | None:
        return public_upload_name(value, "invoice")
    
    class Config:
        from_attributes = True

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
