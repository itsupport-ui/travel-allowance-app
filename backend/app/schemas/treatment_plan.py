from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TreatmentPlanCreate(BaseModel):
    id: int
    doctor_visit_id: int
    doctor_id: int
    patient_name: str
    diagnosis: str | None = None
    chief_complaint: str | None = None
    treatment_plan: str | None = None
    medicines: str | None = None
    sessions_required: int | None = None
    frequency: str | None = None
    duration: str | None = None
    special_instructions: str | None = None
    remarks: str | None = None
    status: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# create TreatPmentPlanUpdate schema all fields optional
class TreatmentPlanUpdate(BaseModel):
    doctor_visit_id: int | None = None
    doctor_id: int | None = None
    patient_name: str | None = None
    diagnosis: str | None = None
    chief_complaint: str | None = None
    treatment_plan: str | None = None
    medicines: str | None = None
    sessions_required: int | None = None
    frequency: str | None = None
    duration: str | None = None
    special_instructions: str | None = None
    remarks: str | None = None
    status: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TreatmentPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_visit_id: int
    doctor_id: int
    doctor_name: str | None = None
    patient_name: str
    diagnosis: str | None = None
    chief_complaint: str | None = None
    treatment_plan: str | None = None
    medicines: str | None = None
    sessions_required: int | None = None
    frequency: str | None = None
    duration: str | None = None
    special_instructions: str | None = None
    remarks: str | None = None
    status: str
    has_schedule: bool = False
    schedule_count: int = 0
    created_at: datetime
    updated_at: datetime | None = None


class TreatmentPlanRejectRequest(BaseModel):
    reason: str


class TreatmentPlanScheduleCreate(BaseModel):
    therapist_id: int
    treatment_date: date | None = None
    start_date: date | None = None
    number_of_sessions: int = Field(gt=0)
    in_time: time
    out_time: time
    priority: str
    instructions: str
    transport_mode: str

    @model_validator(mode="after")
    def validate_session_date(self):
        if (self.treatment_date is None) == (self.start_date is None):
            raise ValueError(
                "Provide exactly one of treatment_date or start_date"
            )
        return self
