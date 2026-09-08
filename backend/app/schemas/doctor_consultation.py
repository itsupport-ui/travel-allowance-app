from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    lifecycle_version: int | None = Field(default=None, ge=1)


class DoctorConsultationConfirm(BaseModel):
    lifecycle_version: int | None = Field(default=None, ge=1)


class DoctorConsultationComplete(BaseModel):
    call_outcome: str = Field(min_length=1)
    preliminary_diagnosis: str | None = None
    proposed_treatment: str | None = None
    estimated_amount: float | None = Field(default=None, ge=0)
    patient_decision: PatientDecision
    follow_up_date: date | None = None
    follow_up_time: time | None = None
    follow_up_reason: str | None = Field(default=None, min_length=3)
    lifecycle_version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_follow_up_details(self):
        details = (
            self.follow_up_date,
            self.follow_up_time,
            self.follow_up_reason,
        )
        if self.patient_decision == "follow_up" and not all(details):
            raise ValueError(
                "Follow-up date, time, and reason are required when follow-up is selected"
            )
        if self.patient_decision != "follow_up" and any(details):
            raise ValueError(
                "Follow-up details are only allowed when follow-up is selected"
            )
        if self.follow_up_reason is not None:
            self.follow_up_reason = self.follow_up_reason.strip()
            if len(self.follow_up_reason) < 3:
                raise ValueError("Follow-up reason must contain at least 3 characters")
        return self


class DoctorConsultationReject(BaseModel):
    rejection_reason: str = Field(min_length=1)
    lifecycle_version: int | None = Field(default=None, ge=1)

    @field_validator("rejection_reason")
    @classmethod
    def validate_rejection_reason(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Rejection reason is required")
        return normalized_value


class DoctorConsultationCancel(BaseModel):
    cancellation_code: Literal[
        "patient_cancelled",
        "doctor_unavailable",
        "duplicate",
        "other",
    ]
    reason: str = Field(min_length=5)
    lifecycle_version: int = Field(ge=1)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 5:
            raise ValueError("Cancellation reason must contain at least 5 characters")
        return normalized


class DoctorConsultationReschedule(BaseModel):
    scheduled_date: date
    scheduled_time: time
    reason: str = Field(min_length=5)
    lifecycle_version: int = Field(ge=1)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 5:
            raise ValueError("Rescheduling reason must contain at least 5 characters")
        return normalized


class DoctorConsultationFollowUpSchedule(BaseModel):
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    reason: str | None = Field(default=None, min_length=3)
    lifecycle_version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_schedule_pair(self):
        if (self.scheduled_date is None) != (self.scheduled_time is None):
            raise ValueError("Follow-up date and time must be provided together")
        if self.reason is not None:
            self.reason = self.reason.strip()
            if len(self.reason) < 3:
                raise ValueError("Follow-up reason must contain at least 3 characters")
        return self


class DoctorConsultationEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    consultation_id: int
    event_type: str
    actor_id: int
    from_status: str | None = None
    to_status: str | None = None
    from_decision: str | None = None
    to_decision: str | None = None
    reason: str | None = None
    related_consultation_id: int | None = None
    related_visit_id: int | None = None
    lifecycle_version: int
    created_at: datetime


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
    origin_consultation_id: int | None = None
    successor_consultation_id: int | None = None
    origin_kind: str | None = None
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
    follow_up_date: date | None = None
    follow_up_time: time | None = None
    follow_up_reason: str | None = None
    cancellation_code: str | None = None
    cancellation_reason: str | None = None
    cancelled_by: int | None = None
    cancelled_at: datetime | None = None
    patient_decision: PatientDecision
    status: Literal["scheduled", "completed", "cancelled"]
    created_by: int
    created_at: datetime
    completed_at: datetime | None = None
    lifecycle_version: int = 1
    updated_at: datetime | None = None
    available_actions: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)
    next_action: str | None = None
