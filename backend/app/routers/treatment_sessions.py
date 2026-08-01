from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers.treatment_schedule import complete_treatment
from app.schemas.treatment_schedule import TreatmentScheduleResponse
from app.schemas.treatment_session import (
    PunchInRequest,
    TreatmentSessionResponse,
)
from app.services.schedule_location_service import validate_patient_arrival
from app.utils.auth import require_role
from app.utils.timezone import india_now

router = APIRouter(
    prefix="/treatment-sessions",
    tags=["Treatment Sessions"],
)


def _get_owned_schedule(
    db: Session,
    schedule_id: int,
    therapist_id: int,
    *,
    lock: bool = False,
) -> TreatmentSchedule:
    query = db.query(TreatmentSchedule).filter(
        TreatmentSchedule.id == schedule_id,
    )
    if lock:
        query = query.with_for_update()
    schedule = query.first()

    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    if schedule.therapist_id != therapist_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return schedule


def _has_active_workday(
    db: Session,
    therapist_id: int,
) -> bool:
    return (
        db.query(TherapistWorkDay.id)
        .filter(
            TherapistWorkDay.therapist_id == therapist_id,
            TherapistWorkDay.work_date == india_now().date(),
            TherapistWorkDay.is_active.is_(True),
        )
        .first()
        is not None
    )


def _occurs_today(schedule: TreatmentSchedule) -> bool:
    today = india_now().date()
    if schedule.schedule_type == "one_time":
        return schedule.treatment_date == today
    return bool(
        schedule.start_date
        and schedule.end_date
        and schedule.start_date <= today <= schedule.end_date
    )


def _elapsed_seconds(start: datetime | None, end: datetime) -> int:
    if start is None:
        return 0
    if start.tzinfo is None:
        end = end.replace(tzinfo=None)
    return max(0, int((end - start).total_seconds()))


def _session_response(
    *,
    schedule: TreatmentSchedule,
    workday_started: bool,
    location_verified: bool | None,
    can_punch_in: bool,
    eligibility_message: str | None,
) -> TreatmentSessionResponse:
    elapsed = schedule.treatment_duration or 0
    if (
        schedule.session_status == "IN_PROGRESS"
        and schedule.punch_in_time is not None
    ):
        elapsed = _elapsed_seconds(schedule.punch_in_time, india_now())

    return TreatmentSessionResponse(
        schedule_id=schedule.id,
        therapist_id=schedule.therapist_id,
        schedule_status=schedule.status,
        session_status=schedule.session_status or "NOT_STARTED",
        punch_in_time=schedule.punch_in_time,
        punch_out_time=schedule.punch_out_time,
        punch_in_latitude=schedule.punch_in_latitude,
        punch_in_longitude=schedule.punch_in_longitude,
        punch_out_latitude=schedule.punch_out_latitude,
        punch_out_longitude=schedule.punch_out_longitude,
        treatment_duration=schedule.treatment_duration,
        elapsed_seconds=elapsed,
        workday_started=workday_started,
        location_verified=location_verified,
        can_punch_in=can_punch_in,
        can_punch_out=(
            schedule.status == "scheduled"
            and schedule.session_status == "IN_PROGRESS"
            and schedule.punch_in_time is not None
            and schedule.punch_out_time is None
        ),
        eligibility_message=eligibility_message,
    )


@router.get(
    "/{schedule_id}",
    response_model=TreatmentSessionResponse,
)
def get_treatment_session(
    schedule_id: int,
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude must be provided together.",
        )

    schedule = _get_owned_schedule(db, schedule_id, current_user.id)
    workday_started = _has_active_workday(db, current_user.id)
    location_verified = None
    eligibility_message = None
    can_punch_in = False

    if schedule.status != "scheduled":
        eligibility_message = (
            f"This schedule is already {schedule.status}."
        )
    elif schedule.session_status == "IN_PROGRESS":
        eligibility_message = "Treatment is in progress."
    elif schedule.session_status == "COMPLETED":
        eligibility_message = "Treatment has already been completed."
    elif not workday_started:
        eligibility_message = "Start your workday before punching in."
    elif not _occurs_today(schedule):
        eligibility_message = (
            "Punch In is available only on the scheduled visit date."
        )
    elif latitude is None or longitude is None:
        eligibility_message = "Verifying your current location."
    else:
        try:
            validate_patient_arrival(
                arrival_latitude=latitude,
                arrival_longitude=longitude,
                patient_latitude=schedule.patient_latitude,
                patient_longitude=schedule.patient_longitude,
            )
            location_verified = True
            can_punch_in = True
            eligibility_message = "You are within the patient visit radius."
        except ValueError as error:
            location_verified = False
            eligibility_message = str(error)

    return _session_response(
        schedule=schedule,
        workday_started=workday_started,
        location_verified=location_verified,
        can_punch_in=can_punch_in,
        eligibility_message=eligibility_message,
    )


@router.post(
    "/{schedule_id}/punch-in",
    response_model=TreatmentSessionResponse,
)
def punch_in(
    schedule_id: int,
    payload: PunchInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    schedule = _get_owned_schedule(
        db,
        schedule_id,
        current_user.id,
        lock=True,
    )

    if schedule.status != "scheduled":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot punch in to a {schedule.status} schedule.",
        )
    if schedule.punch_in_time is not None or (
        schedule.session_status != "NOT_STARTED"
    ):
        raise HTTPException(
            status_code=400,
            detail="Treatment has already been punched in.",
        )
    if not _has_active_workday(db, current_user.id):
        raise HTTPException(
            status_code=400,
            detail="Start your workday before punching in.",
        )
    if not _occurs_today(schedule):
        raise HTTPException(
            status_code=400,
            detail="Punch In is available only on the scheduled visit date.",
        )

    try:
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=schedule.patient_latitude,
            patient_longitude=schedule.patient_longitude,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    punched_in_at = india_now()
    schedule.punch_in_time = punched_in_at
    schedule.punch_in_latitude = payload.latitude
    schedule.punch_in_longitude = payload.longitude
    schedule.session_status = "IN_PROGRESS"
    db.commit()
    db.refresh(schedule)

    return _session_response(
        schedule=schedule,
        workday_started=True,
        location_verified=True,
        can_punch_in=False,
        eligibility_message="Treatment started.",
    )


@router.post(
    "/{schedule_id}/punch-out",
    response_model=TreatmentScheduleResponse,
)
def punch_out(
    schedule_id: int,
    completion_notes: str | None = Form(None),
    transport_mode: str = Form("vehicle"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    device_timestamp: datetime | None = Form(None),
    bill_amount: float | None = Form(None),
    invoice_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    del device_timestamp
    schedule = _get_owned_schedule(
        db,
        schedule_id,
        current_user.id,
        lock=True,
    )
    if schedule.status != "scheduled":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot punch out from a {schedule.status} schedule.",
        )
    if (
        schedule.session_status != "IN_PROGRESS"
        or schedule.punch_in_time is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Punch In is required before Punch Out.",
        )
    if schedule.punch_out_time is not None:
        raise HTTPException(
            status_code=400,
            detail="Treatment has already been punched out.",
        )

    punched_out_at = india_now()
    schedule.punch_out_time = punched_out_at
    schedule.punch_out_latitude = latitude
    schedule.punch_out_longitude = longitude
    schedule.treatment_duration = _elapsed_seconds(
        schedule.punch_in_time,
        punched_out_at,
    )
    schedule.session_status = "COMPLETED"

    return complete_treatment(
        schedule_id=schedule_id,
        completion_notes=completion_notes,
        transport_mode=transport_mode,
        arrival_latitude=latitude,
        arrival_longitude=longitude,
        bill_amount=bill_amount,
        invoice_file=invoice_file,
        db=db,
        current_user=current_user,
    )
