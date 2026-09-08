from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


EarlyClosureRole = Literal["doctor", "therapist"]
EarlyClosureReviewStatus = Literal[
    "pending",
    "acknowledged",
    "follow_up_required",
]


class EarlyClosureDecision(BaseModel):
    decision: Literal["acknowledged", "follow_up_required"]
    reason: str = Field(min_length=5, max_length=500)
    version: int = Field(ge=1)


class EarlyClosureReviewResponse(BaseModel):
    staff_role: EarlyClosureRole
    workday_id: int
    staff_id: int
    staff_name: str
    business_date: date
    started_at: datetime
    ended_at: datetime
    total_work_minutes: int
    completed_activities: int
    pending_activities: int
    missed_activities: int | None = None
    staff_reason: str
    review_status: EarlyClosureReviewStatus
    reviewed_by: int | None = None
    reviewer_name: str | None = None
    review_reason: str | None = None
    reviewed_at: datetime | None = None
    version: int
    available_actions: list[str] = Field(default_factory=list)
