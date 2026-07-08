from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PatientDecision = Literal[
    "pending",
    "confirmed",
    "rejected",
    "follow_up",
]


class DoctorConsultationCreate(BaseModel):
    patient_name: str
    patient_phone: str
    patient_address: str
    doctor_id: int
    scheduled_date: date
    scheduled_time: time
    purpose: str
    notes: str | None = None


class DoctorConsultationVisitCreate(BaseModel):
    visit_date: date
    visit_time: time
    remarks: str | None = None


class DoctorConsultationComplete(BaseModel):
    call_outcome: str = Field(min_length=1)
    preliminary_diagnosis: str | None = None
    proposed_treatment: str | None = None
    estimated_amount: float | None = Field(default=None, ge=0)
    patient_decision: PatientDecision


class DoctorConsultationReject(BaseModel):
    rejection_reason: str = Field(min_length=1)

    @field_validator("rejection_reason")
    @classmethod
    def validate_rejection_reason(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Rejection reason is required")
        return normalized_value


class DoctorConsultationDashboardResponse(BaseModel):
    today_calls: int
    scheduled: int
    completed: int
    pending_confirmation: int
    confirmed: int
    rejected: int
    follow_up: int


class DoctorConsultationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_name: str
    patient_phone: str
    patient_address: str
    doctor_id: int
    doctor_visit_id: int | None = None
    visit_id: int | None = None
    has_visit: bool = False
    scheduled_date: date
    scheduled_time: time
    purpose: str
    notes: str | None = None
    call_outcome: str | None = None
    preliminary_diagnosis: str | None = None
    proposed_treatment: str | None = None
    estimated_amount: float | None = None
    rejection_reason: str | None = None
    patient_decision: PatientDecision
    status: Literal["scheduled", "completed", "cancelled"]
    created_by: int
    created_at: datetime
    completed_at: datetime | None = None
