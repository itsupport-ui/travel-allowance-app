from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class ReportKpis(BaseModel):
    todays_treatments: int
    completed_treatments: int
    cancelled_treatments: int
    patients_visited: int
    total_claims: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int
    total_km: float
    total_travel_amount: float
    average_km_per_therapist: float
    active_therapists: int
    top_performing_therapist: str | None


class ReportTrendPoint(BaseModel):
    date: date
    completed_treatments: int
    total_km: float
    travel_amount: float


class ReportClaimStatusPoint(BaseModel):
    status: Literal["pending", "approved", "rejected"]
    count: int


class ReportTopTherapist(BaseModel):
    therapist_id: int
    therapist_name: str
    completed_treatments: int
    total_km: float
    claims_submitted: int


class ReportActivity(BaseModel):
    id: str
    activity_type: Literal["claim", "treatment", "travel"]
    therapist_name: str
    occurred_at: datetime
    status: str
    amount: float | None
    description: str


class ReportInsight(BaseModel):
    key: str
    title: str
    value: str
    detail: str
    direction: Literal["up", "down", "neutral"]
    change_percent: float | None = None


class AdminReportOverview(BaseModel):
    generated_at: datetime
    period_label: str
    trend_period_label: str
    has_data: bool
    kpis: ReportKpis
    trends: list[ReportTrendPoint]
    claims_by_status: list[ReportClaimStatusPoint]
    top_therapists: list[ReportTopTherapist]
    recent_activity: list[ReportActivity]
    insights: list[ReportInsight]
