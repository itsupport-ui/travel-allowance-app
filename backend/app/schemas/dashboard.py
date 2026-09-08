from pydantic import BaseModel, ConfigDict


class DashboardSummary(BaseModel):
    today_trips: int
    today_km: float
    pending_claims: int
    approved_claims: int
    today_scheduled: int
    completed_today: int
    missed_today: int
    upcoming: int

    model_config = ConfigDict(from_attributes=True)


class AdminDashboardSummary(BaseModel):
    total_therapists: int
    total_doctors: int
    total_clinical_staff: int
    todays_schedules: int
    todays_therapist_schedules: int
    todays_doctor_visits: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int
    completed_treatments: int
    completed_therapist_treatments: int
    completed_doctor_visits: int
    missed_clinical_activities: int
    todays_claims: int
    open_follow_ups: int
