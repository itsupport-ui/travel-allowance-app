from pydantic import BaseModel


class DashboardSummary(BaseModel):
    today_trips: int
    today_km: float
    pending_claims: int
    approved_claims: int
    today_scheduled: int
    completed_today: int
    missed_today: int
    upcoming: int

    class Config:
        from_attributes = True


class AdminDashboardSummary(BaseModel):
    total_therapists: int
    todays_schedules: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int
    completed_treatments: int
    todays_claims: int
