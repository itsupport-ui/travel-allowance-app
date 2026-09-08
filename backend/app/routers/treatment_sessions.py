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
from app.models.location_exception_request import LocationExceptionRequest
from app.models.user import User
from app.routers.treatment_schedule import complete_treatment
from app.schemas.treatment_schedule import TreatmentScheduleResponse
from app.schemas.treatment_session import (
    PunchInRequest,
    TreatmentSessionResponse,
)
from app.services.schedule_location_service import validate_patient_arrival
from app.services.location_exception_service import (
    consume_approved_exception,
    get_active_request,
    validate_action_location_evidence,
)
from app.services.location_policy_service import get_location_policy
from app.services.domain_audit_service import record_domain_audit_event
from app.utils.auth import require_role
from app.utils.timezone import india_now
from app.utils.domain_errors import DomainHTTPException

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
    location_exception: LocationExceptionRequest | None = None,
    can_request_location_exception: bool = False,
    can_punch_out: bool | None = None,
    location_policy=None,
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
            can_punch_out
            if can_punch_out is not None
            else (
                schedule.status == "scheduled"
                and schedule.session_status == "IN_PROGRESS"
                and schedule.punch_in_time is not None
                and schedule.punch_out_time is None
            )
        ),
        eligibility_message=eligibility_message,
        location_exception_id=(
            location_exception.id if location_exception is not None else None
        ),
        location_exception_status=(
            location_exception.status
            if location_exception is not None
            else None
        ),
        can_request_location_exception=can_request_location_exception,
        location_policy_version=(
            location_policy.version if location_policy is not None else None
        ),
        geofence_radius_m=(
            location_policy.geofence_radius_m
            if location_policy is not None
            else None
        ),
        gps_accuracy_threshold_m=(
            location_policy.gps_accuracy_threshold_m
            if location_policy is not None
            else None
        ),
    )


@router.get(
    "/{schedule_id}",
    response_model=TreatmentSessionResponse,
)
def get_treatment_session(
    schedule_id: int,
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    gps_accuracy_m: float | None = Query(default=None),
    device_timestamp: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude must be provided together.",
        )

    schedule = _get_owned_schedule(db, schedule_id, current_user.id)
    location_policy = get_location_policy(db, india_now().date())
    workday_started = _has_active_workday(db, current_user.id)
    location_verified = None
    eligibility_message = None
    can_punch_in = False
    location_exception = None
    can_request_location_exception = False

    if schedule.status != "scheduled":
        eligibility_message = (
            f"This schedule is already {schedule.status}."
        )
    elif schedule.session_status == "IN_PROGRESS":
        if latitude is None or longitude is None:
            eligibility_message = "Capture location before Punch Out."
        else:
            try:
                validate_action_location_evidence(
                    device_timestamp=device_timestamp,
                    gps_accuracy_m=gps_accuracy_m,
                    accuracy_threshold_m=(
                        location_policy.gps_accuracy_threshold_m
                    ),
                    max_age_minutes=(
                        location_policy.evidence_max_age_minutes
                    ),
                )
                validate_patient_arrival(
                    arrival_latitude=latitude,
                    arrival_longitude=longitude,
                    patient_latitude=schedule.patient_latitude,
                    patient_longitude=schedule.patient_longitude,
                    radius_km=location_policy.geofence_radius_m / 1000,
                )
                location_verified = True
                eligibility_message = (
                    "Treatment is ready for Punch Out within the configured "
                    f"{location_policy.geofence_radius_m:.0f} metre radius."
                )
            except ValueError as error:
                location_verified = False
                location_exception = get_active_request(
                    db,
                    requested_by=current_user.id,
                    target_type="therapist_schedule",
                    target_id=schedule.id,
                    action="punch_out",
                )
                if location_exception is not None:
                    if location_exception.status == "approved":
                        eligibility_message = (
                            "Location exception approved. Punch Out will consume "
                            "this one-time approval."
                        )
                    else:
                        eligibility_message = (
                            "Location exception is awaiting administrator review."
                        )
                else:
                    can_request_location_exception = True
                    eligibility_message = str(error)
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
            validate_action_location_evidence(
                device_timestamp=device_timestamp,
                gps_accuracy_m=gps_accuracy_m,
                accuracy_threshold_m=(
                    location_policy.gps_accuracy_threshold_m
                ),
                max_age_minutes=location_policy.evidence_max_age_minutes,
            )
            validate_patient_arrival(
                arrival_latitude=latitude,
                arrival_longitude=longitude,
                patient_latitude=schedule.patient_latitude,
                patient_longitude=schedule.patient_longitude,
                radius_km=location_policy.geofence_radius_m / 1000,
            )
            location_verified = True
            can_punch_in = True
            eligibility_message = (
                "You are within the configured patient radius "
                f"({location_policy.geofence_radius_m:.0f} metres)."
            )
        except ValueError as error:
            location_verified = False
            location_exception = get_active_request(
                db,
                requested_by=current_user.id,
                target_type="therapist_schedule",
                target_id=schedule.id,
                action="punch_in",
            )
            if location_exception is not None:
                if location_exception.status == "approved":
                    can_punch_in = True
                    eligibility_message = (
                        "Location exception approved. Punch In will consume "
                        "this one-time approval."
                    )
                else:
                    eligibility_message = (
                        "Location exception is awaiting administrator review."
                    )
            else:
                can_request_location_exception = True
                eligibility_message = str(error)

    return _session_response(
        schedule=schedule,
        workday_started=workday_started,
        location_verified=location_verified,
        can_punch_in=can_punch_in,
        eligibility_message=eligibility_message,
        location_exception=location_exception,
        can_request_location_exception=can_request_location_exception,
        can_punch_out=(
            schedule.status == "scheduled"
            and schedule.session_status == "IN_PROGRESS"
            and schedule.punch_in_time is not None
            and schedule.punch_out_time is None
            and (
                location_verified is not False
                or location_exception is not None
                and location_exception.status == "approved"
            )
        ),
        location_policy=location_policy,
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
    location_policy = get_location_policy(db, india_now().date())

    if (
        schedule.status == "scheduled"
        and schedule.session_status == "IN_PROGRESS"
        and schedule.punch_in_time is not None
        and schedule.punch_out_time is None
    ):
        return _session_response(
            schedule=schedule,
            workday_started=_has_active_workday(db, current_user.id),
            location_verified=True,
            can_punch_in=False,
            eligibility_message="Treatment is already in progress.",
        )

    if schedule.status != "scheduled":
        raise DomainHTTPException(
            status_code=400,
            code="SCHEDULE_NOT_PUNCHABLE",
            message=f"Cannot punch in to a {schedule.status} schedule.",
            recoverable=False,
            suggested_action="view_schedule_status",
            blocking_fields=["schedule_status"],
        )
    if schedule.punch_in_time is not None or (
        schedule.session_status != "NOT_STARTED"
    ):
        raise DomainHTTPException(
            status_code=400,
            code="TREATMENT_ALREADY_STARTED",
            message="Treatment has already been punched in.",
            recoverable=True,
            suggested_action="refresh_treatment_session",
        )
    if not _has_active_workday(db, current_user.id):
        raise DomainHTTPException(
            status_code=400,
            code="WORKDAY_NOT_ACTIVE",
            message="Start your workday before punching in.",
            recoverable=True,
            suggested_action="start_workday",
        )
    if not _occurs_today(schedule):
        raise DomainHTTPException(
            status_code=400,
            code="SCHEDULE_NOT_DUE_TODAY",
            message="Punch In is available only on the scheduled visit date.",
            recoverable=False,
            suggested_action="view_schedule_date",
            blocking_fields=["occurrence_date"],
        )
    another_active_session = (
        db.query(TreatmentSchedule.id)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.status == "scheduled",
            TreatmentSchedule.session_status == "IN_PROGRESS",
            TreatmentSchedule.id != schedule.id,
        )
        .first()
    )
    if another_active_session is not None:
        raise DomainHTTPException(
            status_code=400,
            code="ANOTHER_TREATMENT_IS_ACTIVE",
            message=(
                "Punch out from the active treatment before starting another."
            ),
            recoverable=True,
            suggested_action="punch_out_active_treatment",
            blocking_fields=["active_schedule_id"],
        )

    exception_used = None
    try:
        validate_action_location_evidence(
            device_timestamp=payload.device_timestamp,
            gps_accuracy_m=payload.gps_accuracy_m,
            accuracy_threshold_m=location_policy.gps_accuracy_threshold_m,
            max_age_minutes=location_policy.evidence_max_age_minutes,
        )
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=schedule.patient_latitude,
            patient_longitude=schedule.patient_longitude,
            radius_km=location_policy.geofence_radius_m / 1000,
        )
    except ValueError as exc:
        exception_used = consume_approved_exception(
            db,
            exception_id=payload.location_exception_id,
            requested_by=current_user.id,
            target_type="therapist_schedule",
            target_id=schedule.id,
            action="punch_in",
            latitude=payload.latitude,
            longitude=payload.longitude,
            verification_message=str(exc),
        )

    punched_in_at = india_now()
    schedule.punch_in_time = punched_in_at
    schedule.punch_in_latitude = payload.latitude
    schedule.punch_in_longitude = payload.longitude
    schedule.session_status = "IN_PROGRESS"
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="treatment_schedule",
        entity_id=schedule.id,
        action="punch_in",
        business_date=(
            schedule.occurrence_date
            or schedule.treatment_date
            or india_now().date()
        ),
        from_state="not_started",
        to_state="in_progress",
        related_entity_type="therapist",
        related_entity_id=current_user.id,
        details={
            "location_exception_id": (
                exception_used.id if exception_used is not None else None
            )
        },
    )
    db.commit()
    db.refresh(schedule)

    return _session_response(
        schedule=schedule,
        workday_started=True,
        location_verified=exception_used is None,
        can_punch_in=False,
        eligibility_message=(
            "Treatment started with an approved location exception."
            if exception_used is not None
            else "Treatment started."
        ),
        location_policy=location_policy,
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
    gps_accuracy_m: float | None = Form(None),
    location_exception_id: int | None = Form(None),
    bill_amount: float | None = Form(None),
    invoice_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    schedule = _get_owned_schedule(
        db,
        schedule_id,
        current_user.id,
        lock=True,
    )
    location_policy = get_location_policy(db, india_now().date())
    if (
        schedule.status == "completed"
        and schedule.session_status == "COMPLETED"
        and schedule.punch_out_time is not None
    ):
        return schedule
    if schedule.status != "scheduled":
        raise DomainHTTPException(
            status_code=400,
            code="SCHEDULE_NOT_PUNCHABLE",
            message=f"Cannot punch out from a {schedule.status} schedule.",
            recoverable=False,
            suggested_action="view_schedule_status",
            blocking_fields=["schedule_status"],
        )
    if (
        schedule.session_status != "IN_PROGRESS"
        or schedule.punch_in_time is None
    ):
        raise DomainHTTPException(
            status_code=400,
            code="TREATMENT_NOT_STARTED",
            message="Punch In is required before Punch Out.",
            recoverable=True,
            suggested_action="punch_in_treatment",
        )
    if schedule.punch_out_time is not None:
        raise HTTPException(
            status_code=400,
            detail="Treatment has already been punched out.",
        )

    exception_used = None
    try:
        validate_action_location_evidence(
            device_timestamp=device_timestamp,
            gps_accuracy_m=gps_accuracy_m,
            accuracy_threshold_m=location_policy.gps_accuracy_threshold_m,
            max_age_minutes=location_policy.evidence_max_age_minutes,
        )
        validate_patient_arrival(
            arrival_latitude=latitude,
            arrival_longitude=longitude,
            patient_latitude=schedule.patient_latitude,
            patient_longitude=schedule.patient_longitude,
            radius_km=location_policy.geofence_radius_m / 1000,
        )
    except ValueError as exc:
        exception_used = consume_approved_exception(
            db,
            exception_id=location_exception_id,
            requested_by=current_user.id,
            target_type="therapist_schedule",
            target_id=schedule.id,
            action="punch_out",
            latitude=latitude,
            longitude=longitude,
            verification_message=str(exc),
        )
        schedule.location_exception_approved = True

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
