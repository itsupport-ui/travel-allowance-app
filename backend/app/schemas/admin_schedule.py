from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel


class AdminScheduleSummary(BaseModel):
    today: int
    upcoming: int
    in_progress: int
    completed: int
    completed_today: int
    cancelled: int
    cancelled_today: int
    high_priority_today: int
    conflicts: int


class AdminScheduleReviewItem(BaseModel):
    id: int
    patient_name: str
    patient_reference_id: str | None = None
    patient_phone: str | None = None
    patient_address: str
    area: str
    doctor_id: int
    doctor_name: str
    therapist_id: int
    therapist_name: str
    treatment_name: str
    visit_type: str
    medicines: str | None = None
    schedule_type: str
    occurrence_date: date | None = None
    start_date: date | None = None
    end_date: date | None = None
    start_time: time
    expected_end_time: time
    duration_minutes: int
    priority: str
    status: str
    operational_status: str
    instructions: str
    clinical_notes: str | None = None
    precautions: str | None = None
    has_conflict: bool
    available_actions: list[str]
    blocking_reasons: list[str]
    next_action: str | None = None


class AdminScheduleReviewResponse(BaseModel):
    items: list[AdminScheduleReviewItem]
    summary: AdminScheduleSummary
    page: int
    page_size: int
    total: int
    total_pages: int


class SchedulePatientOption(BaseModel):
    name: str
    reference_id: str | None = None
    phone: str | None = None
    address: str


class ScheduleDoctorOption(BaseModel):
    id: int
    name: str
    specialization: str | None = None


class ScheduleTherapistOption(BaseModel):
    id: int
    name: str
    email: str
    today_appointments: int


class AdminScheduleFormOptions(BaseModel):
    patients: list[SchedulePatientOption]
    doctors: list[ScheduleDoctorOption]
    therapists: list[ScheduleTherapistOption]


class ScheduleConflictItem(BaseModel):
    id: int
    patient_name: str
    schedule_date: date | None = None
    start_time: time
    expected_end_time: time


class TherapistAvailabilityResponse(BaseModel):
    available: bool
    today_appointments: int
    conflicts: list[ScheduleConflictItem]
