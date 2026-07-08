from datetime import date, datetime, time
from pydantic import BaseModel

class DoctorVisitCreate(BaseModel):
    patient_name: str
    patient_phone: str
    patient_address: str
    doctor_id: int
    visit_date: date
    visit_time: time
    chief_complaint: str | None = None
    remarks: str | None = None

class DoctorVisitUpdate(BaseModel):
    patient_name: str | None = None
    patient_phone: str | None = None
    patient_address: str | None = None
    doctor_id: int | None = None
    visit_date: date | None = None
    visit_time: time | None = None
    chief_complaint: str | None = None
    remarks: str | None = None
    status: str | None = None

class DoctorVisitStatusUpdate(BaseModel):
    status: str
    remarks: str | None = None


class DoctorVisitResponse(BaseModel):
    id: int
    patient_name: str
    patient_phone: str
    patient_address: str
    doctor_id: int
    doctor_name: str | None = None
    visit_date: date
    visit_time: time
    chief_complaint: str | None = None
    remarks: str | None = None
    status: str
    created_by: int | None = None
    created_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True

class DoctorVisitDashboardResponse(BaseModel):
    today_visits: int
    scheduled: int
    visited: int
    treatment_plan_submitted: int
    cancelled: int