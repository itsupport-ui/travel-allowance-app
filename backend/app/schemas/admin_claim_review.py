from datetime import date, datetime

from pydantic import BaseModel


class AdminClaimReviewSummary(BaseModel):
    pending_claims: int
    todays_claims: int
    pending_amount: float
    high_value_claims: int
    average_claim_amount: float
    average_distance: float


class AdminClaimReviewItem(BaseModel):
    id: int
    therapist_id: int
    therapist_name: str
    therapist_role: str
    claim_date: date
    submitted_at: datetime | None
    status: str
    patient_name: str | None
    patient_count: int
    visited_count: int
    travel_date: datetime | None
    from_address: str | None
    to_address: str | None
    total_km: float
    per_km_rate: float
    travel_total: float
    daily_allowance: float
    grand_total: float
    notes: str | None
    is_high_value: bool
    is_urgent: bool
    age_days: int


class AdminClaimReviewResponse(BaseModel):
    items: list[AdminClaimReviewItem]
    page: int
    page_size: int
    total: int
    total_pages: int
    high_value_threshold: float
    summary: AdminClaimReviewSummary
