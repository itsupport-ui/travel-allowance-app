from pydantic import BaseModel
from datetime import date

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