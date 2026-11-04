from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.freelance_link_service import normalize_phone


# ---------------------------------------------------------------- directory
class FreelancerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    phone: str
    upi_id: str | None = Field(default=None, max_length=100)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_phone(value)


class FreelancerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    upi_id: str | None = Field(default=None, max_length=100)
    active: bool | None = None


class FreelancerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    upi_id: str | None
    active: bool


# ------------------------------------------------------------------- visits
class FreelanceVisitCreate(BaseModel):
    freelancer_id: int = Field(ge=1)
    patient_name: str = Field(min_length=2, max_length=150)
    patient_phone: str | None = Field(default=None, max_length=20)
    patient_address: str = Field(min_length=5, max_length=500)
    patient_latitude: float | None = Field(default=None, ge=-90, le=90)
    patient_longitude: float | None = Field(default=None, ge=-180, le=180)
    treatment_name: str = Field(min_length=2, max_length=200)
    instructions: str | None = Field(default=None, max_length=2000)
    visit_date: date
    start_time: time | None = None
    end_time: time | None = None
    doctor_id: int | None = Field(default=None, ge=1)
    treatment_plan_id: int | None = Field(default=None, ge=1)
    fee_amount: Decimal = Field(gt=0, le=100000, decimal_places=2)


class FreelanceVisitCancel(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class FreelanceVisitReassign(BaseModel):
    freelancer_id: int = Field(ge=1)
    fee_amount: Decimal | None = Field(
        default=None, gt=0, le=100000, decimal_places=2
    )


class FreelanceVisitMarkPaid(BaseModel):
    payment_reference: str = Field(min_length=3, max_length=100)


class FreelanceVisitResponse(BaseModel):
    id: int
    freelancer_id: int
    freelancer_name: str
    freelancer_phone: str
    freelancer_upi_id: str | None
    patient_name: str
    patient_phone: str | None
    patient_address: str
    treatment_name: str
    instructions: str | None
    visit_date: date
    start_time: time | None
    end_time: time | None
    fee_amount: Decimal
    status: str
    punch_in_time: datetime | None
    punch_out_time: datetime | None
    duration_seconds: int | None
    location_unverified: bool
    unverified_reason: str | None
    has_proof: bool
    completion_notes: str | None
    cancel_reason: str | None
    approved_at: datetime | None
    paid_at: datetime | None
    payment_reference: str | None
    link_active: bool


class FreelanceVisitCreated(BaseModel):
    """Returned once when a link is minted; the token is never retrievable."""

    visit: FreelanceVisitResponse
    link: str
    whatsapp_url: str
    message: str


# ------------------------------------------------------------ public (link)
class PublicVisitView(BaseModel):
    """Everything a freelancer may see. No clinical notes, no ids."""

    freelancer_name: str
    patient_name: str
    patient_phone: str | None
    patient_address: str
    maps_url: str
    treatment_name: str
    instructions: str | None
    visit_date: date
    start_time: time | None
    end_time: time | None
    fee_amount: Decimal
    status: str
    punch_in_time: datetime | None
    punch_out_time: datetime | None
    location_unverified: bool
