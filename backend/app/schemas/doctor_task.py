from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.place import PlaceResponse

TaskType = Literal["clinic_training", "patient_visit", "other"]


class DoctorTaskCreate(BaseModel):
    doctor_id: int = Field(ge=1)
    task_type: TaskType
    title: str = Field(min_length=3, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    scheduled_date: date
    # Required for clinic_training and other tasks.
    place_id: int | None = Field(default=None, ge=1)
    # Required for patient_visit tasks (a visit is created for the doctor).
    patient_name: str | None = Field(default=None, max_length=255)
    patient_phone: str | None = Field(default=None, max_length=20)
    patient_address: str | None = Field(default=None, max_length=255)
    visit_time: time | None = None
    chief_complaint: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_type_fields(self):
        if self.task_type == "patient_visit":
            missing = [
                name
                for name in (
                    "patient_name",
                    "patient_phone",
                    "patient_address",
                    "visit_time",
                )
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(
                    "Patient visit tasks require: " + ", ".join(missing)
                )
        elif self.place_id is None:
            raise ValueError("This task type requires a place.")
        return self


class DoctorTaskCancel(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class DoctorTaskPunchRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    gps_accuracy_m: float | None = Field(default=None, gt=0, le=5000)
    location_exception_id: int | None = None
    device_timestamp: datetime | None = None


class DoctorTaskExpenseOption(BaseModel):
    """A completed task today that has no travel expense yet."""

    id: int
    title: str
    task_type: str
    place_name: str | None = None
    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None


class DoctorTaskDayItem(BaseModel):
    id: int
    title: str
    task_type: str
    status: str
    # Only tasks punched here need a proof photo; patient visits do not.
    proof_required: bool
    has_proof: bool
    has_expense: bool


class DoctorTaskDaySummary(BaseModel):
    business_date: date
    total: int
    completed: int
    unfinished: int
    completed_without_expense: int
    tasks: list[DoctorTaskDayItem]


class DoctorTaskResponse(BaseModel):
    id: int
    task_type: str
    title: str
    notes: str | None = None
    doctor_id: int
    doctor_name: str | None = None
    assigned_by: int
    scheduled_date: date
    status: str
    session_status: str
    place: PlaceResponse | None = None
    doctor_visit_id: int | None = None
    patient_name: str | None = None
    patient_address: str | None = None
    visit_time: time | None = None
    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None
    duration_seconds: int | None = None
    has_proof: bool = False
    completion_notes: str | None = None
    cancel_reason: str | None = None
    # Punching a patient_visit task happens on the linked visit.
    punch_via_visit: bool = False
    can_punch_in: bool = False
    can_punch_out: bool = False
    geofence_radius_m: float | None = None
