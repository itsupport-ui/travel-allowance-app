from __future__ import annotations

from datetime import date, time

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers.admin_schedules import (
    get_form_options,
    get_therapist_availability,
)
from app.routers.treatment_schedule import create_schedule
from app.schemas.admin_schedule import (
    AdminScheduleFormOptions,
    TherapistAvailabilityResponse,
)
from app.schemas.treatment_schedule import (
    TreatmentScheduleCreate,
    TreatmentScheduleResponse,
)
from app.services.doctor_attendance_service import get_current_doctor
from app.utils.auth import require_permission

router = APIRouter(prefix="/doctor-schedules", tags=["Doctor Schedules"])

DIRECT_SOURCE = "direct"


@router.get("/form-options", response_model=AdminScheduleFormOptions)
def doctor_form_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("schedules.create_own")),
):
    doctor = get_current_doctor(db, current_user)
    options = get_form_options(db=db, _current_user=current_user)
    options["doctors"] = [
        item for item in options["doctors"] if item["id"] == doctor.id
    ]
    return options


@router.get(
    "/therapist-availability",
    response_model=TherapistAvailabilityResponse,
)
def doctor_therapist_availability(
    therapist_id: int = Query(ge=1),
    schedule_type: str = Query(),
    treatment_date: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    cadence_days: int = Query(default=1, ge=1, le=31),
    start_time: time = Query(),
    expected_end_time: time = Query(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("schedules.create_own")),
):
    return get_therapist_availability(
        therapist_id=therapist_id,
        schedule_type=schedule_type,
        treatment_date=treatment_date,
        start_date=start_date,
        end_date=end_date,
        cadence_days=cadence_days,
        start_time=start_time,
        expected_end_time=expected_end_time,
        exclude_schedule_id=None,
        db=db,
        _current_user=current_user,
    )


@router.post("/create", response_model=TreatmentScheduleResponse)
def doctor_create_schedule(
    payload: TreatmentScheduleCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("schedules.create_own")),
):
    # A doctor can only schedule as themselves, whatever the payload says.
    doctor = get_current_doctor(db, current_user)
    response = create_schedule(
        treatment_schedule=payload.model_copy(update={"doctor_id": doctor.id}),
        background_tasks=background_tasks,
        db=db,
        current_user=current_user,
    )

    query = db.query(TreatmentSchedule)
    series_id = getattr(response, "series_id", None)
    if series_id is not None:
        query = query.filter(TreatmentSchedule.series_id == series_id)
    else:
        query = query.filter(TreatmentSchedule.id == response.id)
    query.update(
        {
            TreatmentSchedule.created_by_id: current_user.id,
            TreatmentSchedule.source: DIRECT_SOURCE,
        },
        synchronize_session=False,
    )
    db.commit()
    return response
