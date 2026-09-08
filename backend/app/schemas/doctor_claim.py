from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.doctor_expense import DoctorExpenseResponse


class DoctorClaimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_id: int
    claim_date: date
    total_amount: float
    expense_count: int
    status: str
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    approved_by: int | None = None
    rejection_reason: str | None = None
    revision: int = 1
    calculation_version: str = "decimal-v1"
    rounding_mode: str = "ROUND_HALF_UP"
    included_expense_ids: list[int] | None = None
    created_at: datetime
    updated_at: datetime | None = None


class DoctorClaimDetailsResponse(DoctorClaimResponse):
    expenses: list[DoctorExpenseResponse] = Field(default_factory=list)


class DoctorClaimAdminHistoryResponse(DoctorClaimResponse):
    doctor_name: str


class DoctorClaimDashboardResponse(BaseModel):
    total_claims: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int


class DoctorClaimRejectRequest(BaseModel):
    rejection_reason: str = Field(min_length=1)
