from pydantic import BaseModel, ConfigDict, Field
from datetime import date, time, datetime

class TreatmentScheduleCreate(BaseModel):
    patient_name: str
    patient_reference_id: str | None = None
    patient_phone: str | None = None

    doctor_id: int

    therapist_id: int

    treatment_name: str
    visit_type: str = "home_visit"

    medicines: str | None = None

    patient_address: str

    schedule_type: str

    treatment_date: date | None = None

    start_date: date | None = None

    end_date: date | None = None
    cadence_days: int = Field(default=1, ge=1, le=31)

    in_time: time

    out_time: time

    instructions: str = (
        "Wear face mask "
        "and cap during treatment"
    )
    clinical_notes: str | None = None
    precautions: str | None = None

    priority: str = "normal"

class TreatmentScheduleResponse(BaseModel):

    id: int

    treatment_plan_id: int | None = None
    series_id: int | None = None
    occurrence_date: date | None = None
    generated_occurrences: int | None = None

    patient_name: str    
    patient_reference_id: str | None = None
    patient_phone: str | None = None

    doctor_name: str | None = None
    
    therapist_name: str | None = None

    doctor_id: int

    therapist_id: int

    treatment_name: str
    visit_type: str = "home_visit"

    medicines: str | None

    patient_address: str

    patient_latitude: float | None = None

    patient_longitude: float | None = None

    schedule_type: str

    treatment_date: date | None

    start_date: date | None

    end_date: date | None

    in_time: time

    out_time: time

    instructions: str
    clinical_notes: str | None = None
    precautions: str | None = None

    priority: str

    status: str

    created_at: datetime

    completion_notes: str | None

    completed_at: datetime | None

    missed_reason: str | None

    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None
    punch_in_latitude: float | None = None
    punch_in_longitude: float | None = None
    punch_out_latitude: float | None = None
    punch_out_longitude: float | None = None
    treatment_duration: int | None = None
    session_status: str = "NOT_STARTED"

    arrival_warning: str | None = None

    available_actions: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)
    next_action: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CompleteTreatmentRequest(BaseModel):
    completion_notes: str | None = None
    arrival_latitude: float | None = None
    arrival_longitude: float | None = None

class MissedTreatmentRequest(BaseModel):
    missed_reason: str | None = None

class TreatmentScheduleUpdate(BaseModel):
    patient_name: str
    patient_reference_id: str | None = None
    patient_phone: str | None = None

    doctor_id: int

    therapist_id: int

    treatment_name: str
    visit_type: str = "home_visit"

    medicines: str | None = None

    patient_address: str

    schedule_type: str

    treatment_date: date | None = None

    start_date: date | None = None

    end_date: date | None = None

    in_time: time

    out_time: time

    instructions: str
    clinical_notes: str | None = None
    precautions: str | None = None

    priority: str
