from datetime import date, datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.uploads import public_upload_name


class DoctorExpenseCreate(BaseModel):
    expense_date: date
    from_location: str | None = None
    to_location: str | None = None
    visit_id: int | None = None
    transport_mode: str
    fare: float | None = Field(default=None, gt=0)
    remarks: str | None = None
    expense_category: str | None = None
    manual_reason: str | None = None


class DoctorExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_id: int
    doctor_name: str | None = None
    expense_date: date
    workday_id: int | None = None
    visit_id: int | None = None
    from_waypoint_id: int | None = None
    to_waypoint_id: int | None = None
    from_location: str
    to_location: str
    from_latitude: float | None = None
    from_longitude: float | None = None
    to_latitude: float | None = None
    to_longitude: float | None = None
    distance_km: float | None = None
    transport_mode: str
    fare: float
    approved_amount: float | None = None
    proof_file: str | None = None
    remarks: str | None = None
    expense_category: str = "public_transport"
    manual_reason: str | None = None
    manual_review_status: str | None = None
    manual_review_reason: str | None = None
    manual_reviewed_by: int | None = None
    manual_reviewed_at: datetime | None = None
    manual_revision: int = 1
    manual_review_version: int = 1
    policy_id: int | None = None
    rate_applied: float | None = None
    receipt_threshold_applied: float | None = None
    receipt_required: bool = False
    calculation_version: str = "decimal-v1"
    rounding_mode: str = "ROUND_HALF_UP"
    available_actions: list[str] = Field(default_factory=list)
    status: str
    claim_id: int | None = None
    created_at: datetime

    @field_validator("proof_file", mode="before")
    @classmethod
    def serialize_proof_name(cls, value) -> str | None:
        return public_upload_name(value, "proof")


class ManualDoctorExpenseDecision(BaseModel):
    decision: Literal["approved", "changes_requested"]
    reason: str = Field(min_length=5, max_length=500)
    version: int = Field(ge=1)
    approved_amount: float | None = Field(default=None, gt=0)

    @field_validator("approved_amount")
    @classmethod
    def validate_approved_amount_precision(cls, value: float | None):
        if value is None:
            return value
        from decimal import Decimal

        if Decimal(str(value)).as_tuple().exponent < -2:
            raise ValueError("Approved amount must have at most two decimal places")
        return value


class ManualDoctorExpenseReviewEventResponse(BaseModel):
    id: int
    event_type: str
    actor_id: int
    actor_name: str | None = None
    from_status: str | None = None
    to_status: str
    reason: str
    revision: int
    submitted_amount: float
    approved_amount: float | None = None
    created_at: datetime
