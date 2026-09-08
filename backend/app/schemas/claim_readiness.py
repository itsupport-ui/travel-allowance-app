from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


ClaimReadinessState = Literal[
    "ready",
    "blocked",
    "already_submitted",
]
ClaimSubmissionMode = Literal["submit", "resubmit"]
ClaimTotalSource = Literal["eligible_records", "existing_claim", "none"]


class ClaimReadinessBlocker(BaseModel):
    code: str
    message: str
    recoverable: bool
    suggested_action: str | None = None
    affected_count: int = 0
    blocking_fields: list[str] = Field(default_factory=list)


class ClaimReadinessBase(BaseModel):
    business_date: date
    state: ClaimReadinessState
    can_submit: bool
    submission_mode: ClaimSubmissionMode | None = None
    eligible_record_count: int
    eligible_record_ids: list[int] = Field(default_factory=list)
    pending_review_count: int = 0
    existing_claim_id: int | None = None
    existing_claim_status: str | None = None
    existing_claim_revision: int | None = None
    rejection_reason: str | None = None
    total_amount: float
    total_source: ClaimTotalSource
    calculation_version: str
    rounding_mode: str
    available_actions: list[str] = Field(default_factory=list)
    blocking_reasons: list[ClaimReadinessBlocker] = Field(
        default_factory=list
    )
    next_action: str | None = None


class TherapistClaimReadinessResponse(ClaimReadinessBase):
    total_km: float
    per_km_rate: float | None = None
    travel_total: float
    daily_allowance: float
    patient_visited_today: bool
    policy_id: int | None = None
    policy_version: int | None = None
    policy_effective_from: date | None = None


class DoctorClaimReadinessResponse(ClaimReadinessBase):
    expense_total: float
