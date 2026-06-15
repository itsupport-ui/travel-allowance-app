from pydantic import BaseModel
from datetime import date



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
    per_km_rate: float | None = 0.0

    class Config:
        from_attributes = True