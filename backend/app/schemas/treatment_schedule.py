from pydantic import BaseModel
from datetime import date, time, datetime

class TreatmentScheduleCreate(BaseModel):
    patient_name: str

    doctor_id: int

    therapist_id: int

    treatment_name: str

    medicines: str | None = None

    patient_address: str

    schedule_type: str

    treatment_date: date | None = None

    start_date: date | None = None

    end_date: date | None = None

    in_time: time

    out_time: time

    instructions: str = (
        "Wear face mask "
        "and cap during treatment"
    )

    priority: str = "normal"

    transport_mode: str = "vehicle"

class TreatmentScheduleResponse(BaseModel):

    id: int

    patient_name: str    

    doctor_name: str | None = None
    
    therapist_name: str | None = None

    doctor_id: int

    therapist_id: int

    treatment_name: str

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

    priority: str

    status: str

    created_at: datetime

    completion_notes: str | None

    completed_at: datetime | None

    missed_reason: str | None

    transport_mode: str | None = None

    arrival_warning: str | None = None

    class Config:
        from_attributes = True


class CompleteTreatmentRequest(BaseModel):
    completion_notes: str | None = None
    arrival_latitude: float | None = None
    arrival_longitude: float | None = None

class MissedTreatmentRequest(BaseModel):
    missed_reason: str | None = None

class TreatmentScheduleUpdate(BaseModel):
    patient_name: str

    doctor_id: int

    therapist_id: int

    treatment_name: str

    medicines: str | None = None

    patient_address: str

    schedule_type: str

    treatment_date: date | None = None

    start_date: date | None = None

    end_date: date | None = None

    in_time: time

    out_time: time

    instructions: str

    priority: str

    transport_mode: str | None = None
