from pydantic import BaseModel


class DashboardSummary(BaseModel):
    today_trips: int
    today_km: float
    pending_claims: int
    approved_claims: int

    class Config:
        from_attributes = True