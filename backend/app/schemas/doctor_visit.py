from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict, Field

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
    patient_latitude: float | None = None
    patient_longitude: float | None = None
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
    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None
    punch_in_latitude: float | None = None
    punch_in_longitude: float | None = None
    punch_out_latitude: float | None = None
    punch_out_longitude: float | None = None
    treatment_duration: int | None = None
    session_status: str = "NOT_STARTED"

    model_config = ConfigDict(from_attributes=True)

class DoctorVisitDashboardResponse(BaseModel):
    today_visits: int
    scheduled: int
    visited: int
    treatment_plan_submitted: int
    cancelled: int


class DoctorVisitSessionRequest(BaseModel):
    latitude: float
    longitude: float
    gps_accuracy_m: float | None = Field(default=None, gt=0, le=5000)
    location_exception_id: int | None = None
    device_timestamp: datetime | None = None
    remarks: str | None = None


class DoctorVisitSessionResponse(BaseModel):
    visit_id: int
    consultation_id: int | None = None
    doctor_id: int
    visit_status: str
    session_status: str
    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None
    treatment_duration: int | None = None
    elapsed_seconds: int = 0
    workday_started: bool
    location_verified: bool | None = None
    can_punch_in: bool
    can_punch_out: bool
    eligibility_message: str | None = None
    location_exception_id: int | None = None
    location_exception_status: str | None = None
    can_request_location_exception: bool = False
    location_policy_version: int | None = None
    geofence_radius_m: float | None = None
    gps_accuracy_threshold_m: float | None = None


class DoctorVisitExpenseOption(BaseModel):
    visit_id: int
    patient_name: str
    patient_address: str
    visit_time: time
    status: str
    punch_in_time: datetime | None = None
    punch_out_time: datetime | None = None
    from_location: str
    to_location: str
    from_latitude: float
    from_longitude: float
    to_latitude: float
    to_longitude: float
    distance_km: float | None = None
    expense_id: int | None = None
