from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.user import User
from app.models.location_exception_request import LocationExceptionRequest
from app.schemas.doctor_visit import (
    DoctorVisitSessionRequest,
    DoctorVisitSessionResponse,
    DoctorVisitExpenseOption,
)
from app.services.doctor_attendance_service import (
    append_doctor_waypoint,
    apply_doctor_visit_status,
    elapsed_seconds,
    ensure_visit_coordinates,
    get_current_doctor,
    get_doctor_workday,
    previous_waypoint,
)
from app.services.schedule_location_service import (
    has_valid_coordinates,
    validate_patient_arrival,
)
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
    prefix="/doctor-visits",
    tags=["Doctor Visit Sessions"],
)


def _get_owned_visit(
    db: Session,
    visit_id: int,
    doctor_id: int,
    *,
    for_update: bool = False,
) -> DoctorVisit:
    query = db.query(DoctorVisit).filter(
        DoctorVisit.id == visit_id,
        DoctorVisit.doctor_id == doctor_id,
    )
    if for_update:
        query = query.with_for_update()
    visit = query.first()
    if visit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor visit not found.",
        )
    return visit


def _session_response(
    visit: DoctorVisit,
    *,
    workday_started: bool,
    location_verified: bool | None,
    can_punch_in: bool,
    can_punch_out: bool,
    eligibility_message: str | None,
    location_exception: LocationExceptionRequest | None = None,
    can_request_location_exception: bool = False,
    location_policy=None,
) -> DoctorVisitSessionResponse:
    return DoctorVisitSessionResponse(
        visit_id=visit.id,
        consultation_id=visit.consultation_id,
        doctor_id=visit.doctor_id,
        visit_status=visit.status,
        session_status=visit.session_status,
        punch_in_time=visit.punch_in_time,
        punch_out_time=visit.punch_out_time,
        treatment_duration=visit.treatment_duration,
        elapsed_seconds=elapsed_seconds(
            visit.punch_in_time,
            visit.punch_out_time,
        ),
        workday_started=workday_started,
        location_verified=location_verified,
        can_punch_in=can_punch_in,
        can_punch_out=can_punch_out,
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
    "/today/completed",
    response_model=list[DoctorVisitExpenseOption],
)
def get_today_completed_doctor_visits(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    today = india_now().date()
    doctor = get_current_doctor(db, current_user)
    workday = get_doctor_workday(db, doctor.id, today)
    if workday is None:
        return []

    visits = (
        db.query(DoctorVisit)
        .filter(
            DoctorVisit.doctor_id == doctor.id,
            DoctorVisit.visit_date == today,
            DoctorVisit.status.in_(
                ["visited", "treatment_plan_submitted"]
            ),
            DoctorVisit.session_status == "COMPLETED",
        )
        .order_by(DoctorVisit.punch_out_time.asc())
        .all()
    )
    expenses = {
        expense.visit_id: expense.id
        for expense in db.query(DoctorExpense)
        .filter(
            DoctorExpense.doctor_id == doctor.id,
            DoctorExpense.expense_date == today,
            DoctorExpense.visit_id.is_not(None),
        )
        .all()
    }
    options: list[DoctorVisitExpenseOption] = []
    for visit in visits:
        destination = (
            db.query(DoctorTravelWaypoint)
            .filter(
                DoctorTravelWaypoint.workday_id == workday.id,
                DoctorTravelWaypoint.visit_id == visit.id,
            )
            .first()
        )
        if destination is None:
            continue
        origin = previous_waypoint(db, destination)
        if origin is None:
            continue
        options.append(
            DoctorVisitExpenseOption(
                visit_id=visit.id,
                patient_name=visit.patient_name,
                patient_address=visit.patient_address,
                visit_time=visit.visit_time,
                status=visit.status,
                punch_in_time=visit.punch_in_time,
                punch_out_time=visit.punch_out_time,
                from_location=origin.address or "Starting location",
                to_location=(
                    destination.address or visit.patient_address
                ),
                from_latitude=origin.latitude,
                from_longitude=origin.longitude,
                to_latitude=destination.latitude,
                to_longitude=destination.longitude,
                distance_km=destination.distance_from_previous_km,
                expense_id=expenses.get(visit.id),
            )
        )
    return options


@router.get(
    "/{visit_id}/session",
    response_model=DoctorVisitSessionResponse,
)
def get_doctor_visit_session(
    visit_id: int,
    latitude: float | None = Query(None),
    longitude: float | None = Query(None),
    gps_accuracy_m: float | None = Query(None),
    device_timestamp: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Latitude and longitude must be provided together.",
        )

    today = india_now().date()
    doctor = get_current_doctor(db, current_user)
    visit = _get_owned_visit(db, visit_id, doctor.id)
    location_policy = get_location_policy(db, today)
    workday = get_doctor_workday(
        db,
        doctor.id,
        today,
        active_only=True,
    )
    workday_started = workday is not None
    location_verified = None
    can_punch_in = False
    can_punch_out = (
        workday_started
        and visit.visit_date == today
        and visit.status == "scheduled"
        and visit.session_status == "IN_PROGRESS"
        and visit.punch_out_time is None
    )
    eligibility_message = None
    location_exception = None
    can_request_location_exception = False

    if visit.visit_date != today:
        eligibility_message = "Punch In is available only on the visit date."
    elif visit.status != "scheduled":
        eligibility_message = (
            "This visit is no longer available for a treatment session."
        )
    elif visit.session_status == "IN_PROGRESS":
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
                patient_latitude, patient_longitude = ensure_visit_coordinates(
                    visit
                )
                validate_patient_arrival(
                    arrival_latitude=latitude,
                    arrival_longitude=longitude,
                    patient_latitude=patient_latitude,
                    patient_longitude=patient_longitude,
                    radius_km=location_policy.geofence_radius_m / 1000,
                )
                location_verified = True
                eligibility_message = (
                    "Visit is ready for Punch Out within the configured "
                    f"{location_policy.geofence_radius_m:.0f} metre radius."
                )
                db.commit()
            except ValueError as error:
                db.rollback()
                location_verified = False
                location_exception = get_active_request(
                    db,
                    requested_by=current_user.id,
                    target_type="doctor_visit",
                    target_id=visit.id,
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
    elif visit.session_status == "COMPLETED":
        eligibility_message = "Visit session is complete."
    elif not workday_started:
        eligibility_message = "Start your workday before punching in."
    elif latitude is None or longitude is None:
        eligibility_message = "Current location is required for Punch In."
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
            patient_latitude, patient_longitude = ensure_visit_coordinates(
                visit
            )
            validate_patient_arrival(
                arrival_latitude=latitude,
                arrival_longitude=longitude,
                patient_latitude=patient_latitude,
                patient_longitude=patient_longitude,
                radius_km=location_policy.geofence_radius_m / 1000,
            )
            location_verified = True
            can_punch_in = True
            eligibility_message = (
                "You are within the configured patient radius "
                f"({location_policy.geofence_radius_m:.0f} metres)."
            )
            db.commit()
        except ValueError as error:
            db.rollback()
            location_verified = False
            location_exception = get_active_request(
                db,
                requested_by=current_user.id,
                target_type="doctor_visit",
                target_id=visit.id,
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
        visit,
        workday_started=workday_started,
        location_verified=location_verified,
        can_punch_in=can_punch_in,
        can_punch_out=(
            can_punch_out
            and (
                location_verified is not False
                or location_exception is not None
                and location_exception.status == "approved"
            )
        ),
        eligibility_message=eligibility_message,
        location_exception=location_exception,
        can_request_location_exception=can_request_location_exception,
        location_policy=location_policy,
    )


@router.post(
    "/{visit_id}/punch-in",
    response_model=DoctorVisitSessionResponse,
)
def punch_in_doctor_visit(
    visit_id: int,
    payload: DoctorVisitSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    today = india_now().date()
    doctor = get_current_doctor(db, current_user)
    visit = _get_owned_visit(
        db,
        visit_id,
        doctor.id,
        for_update=True,
    )
    location_policy = get_location_policy(db, today)
    if (
        visit.status == "scheduled"
        and visit.session_status == "IN_PROGRESS"
        and visit.punch_in_time is not None
        and visit.punch_out_time is None
    ):
        return _session_response(
            visit,
            workday_started=True,
            location_verified=True,
            can_punch_in=False,
            can_punch_out=True,
            eligibility_message="Visit is already in progress.",
        )
    workday = get_doctor_workday(
        db,
        doctor.id,
        today,
        active_only=True,
    )
    if workday is None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="WORKDAY_NOT_ACTIVE",
            message="Start your workday before punching in.",
            recoverable=True,
            suggested_action="start_workday",
        )
    if visit.visit_date != today:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="VISIT_NOT_DUE_TODAY",
            message="Punch In is available only on the visit date.",
            recoverable=False,
            suggested_action="view_visit_date",
            blocking_fields=["visit_date"],
        )
    if visit.status != "scheduled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This visit cannot be punched in.",
        )
    if visit.session_status != "NOT_STARTED" or visit.punch_in_time is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This visit has already been punched in.",
        )
    another_active_visit = (
        db.query(DoctorVisit.id)
        .filter(
            DoctorVisit.doctor_id == doctor.id,
            DoctorVisit.status == "scheduled",
            DoctorVisit.session_status == "IN_PROGRESS",
            DoctorVisit.id != visit.id,
        )
        .first()
    )
    if another_active_visit is not None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="ANOTHER_VISIT_IS_ACTIVE",
            message="Punch out from the active visit before starting another.",
            recoverable=True,
            suggested_action="punch_out_active_visit",
            blocking_fields=["active_visit_id"],
        )

    exception_used = None
    patient_latitude = visit.patient_latitude
    patient_longitude = visit.patient_longitude
    try:
        patient_latitude, patient_longitude = ensure_visit_coordinates(visit)
        validate_action_location_evidence(
            device_timestamp=payload.device_timestamp,
            gps_accuracy_m=payload.gps_accuracy_m,
            accuracy_threshold_m=location_policy.gps_accuracy_threshold_m,
            max_age_minutes=location_policy.evidence_max_age_minutes,
        )
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=patient_latitude,
            patient_longitude=patient_longitude,
            radius_km=location_policy.geofence_radius_m / 1000,
        )
    except ValueError as exc:
        exception_used = consume_approved_exception(
            db,
            exception_id=payload.location_exception_id,
            requested_by=current_user.id,
            target_type="doctor_visit",
            target_id=visit.id,
            action="punch_in",
            latitude=payload.latitude,
            longitude=payload.longitude,
            verification_message=str(exc),
        )

    punched_in_at = datetime.now(timezone.utc)
    visit.punch_in_time = punched_in_at
    visit.punch_in_latitude = payload.latitude
    visit.punch_in_longitude = payload.longitude
    visit.session_status = "IN_PROGRESS"
    waypoint_latitude = (
        patient_latitude
        if has_valid_coordinates(patient_latitude, patient_longitude)
        else payload.latitude
    )
    waypoint_longitude = (
        patient_longitude
        if has_valid_coordinates(patient_latitude, patient_longitude)
        else payload.longitude
    )
    append_doctor_waypoint(
        db,
        doctor_id=doctor.id,
        workday_id=workday.id,
        waypoint_type="VISIT",
        latitude=waypoint_latitude,
        longitude=waypoint_longitude,
        address=visit.patient_address,
        recorded_at=punched_in_at,
        visit_id=visit.id,
    )
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="doctor_visit",
        entity_id=visit.id,
        action="punch_in",
        business_date=visit.visit_date,
        from_state="not_started",
        to_state="in_progress",
        related_entity_type="doctor_workday",
        related_entity_id=workday.id,
        details={
            "location_exception_id": (
                exception_used.id if exception_used is not None else None
            )
        },
    )
    db.commit()
    db.refresh(visit)
    return _session_response(
        visit,
        workday_started=True,
        location_verified=exception_used is None,
        can_punch_in=False,
        can_punch_out=True,
        eligibility_message=(
            "Visit started with an approved location exception."
            if exception_used is not None
            else "Visit is in progress."
        ),
        location_policy=location_policy,
    )


@router.post(
    "/{visit_id}/punch-out",
    response_model=DoctorVisitSessionResponse,
)
def punch_out_doctor_visit(
    visit_id: int,
    payload: DoctorVisitSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    today = india_now().date()
    doctor = get_current_doctor(db, current_user)
    visit = _get_owned_visit(
        db,
        visit_id,
        doctor.id,
        for_update=True,
    )
    location_policy = get_location_policy(db, today)
    if (
        visit.status in {"visited", "treatment_plan_submitted"}
        and visit.session_status == "COMPLETED"
        and visit.punch_out_time is not None
    ):
        return _session_response(
            visit,
            workday_started=(
                get_doctor_workday(
                    db,
                    doctor.id,
                    today,
                    active_only=True,
                )
                is not None
            ),
            location_verified=True,
            can_punch_in=False,
            can_punch_out=False,
            eligibility_message="Visit was already completed.",
        )
    workday = get_doctor_workday(
        db,
        doctor.id,
        today,
        active_only=True,
    )
    if workday is None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="WORKDAY_NOT_ACTIVE",
            message="An active workday is required to punch out.",
            recoverable=True,
            suggested_action="resume_workday",
        )
    if (
        visit.visit_date != today
        or visit.status != "scheduled"
        or visit.session_status != "IN_PROGRESS"
        or visit.punch_in_time is None
    ):
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="VISIT_NOT_STARTED",
            message="Punch In is required before Punch Out.",
            recoverable=True,
            suggested_action="punch_in_visit",
        )
    if visit.punch_out_time is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This visit has already been punched out.",
        )

    exception_used = None
    try:
        validate_action_location_evidence(
            device_timestamp=payload.device_timestamp,
            gps_accuracy_m=payload.gps_accuracy_m,
            accuracy_threshold_m=location_policy.gps_accuracy_threshold_m,
            max_age_minutes=location_policy.evidence_max_age_minutes,
        )
        patient_latitude, patient_longitude = ensure_visit_coordinates(visit)
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=patient_latitude,
            patient_longitude=patient_longitude,
            radius_km=location_policy.geofence_radius_m / 1000,
        )
    except ValueError as exc:
        exception_used = consume_approved_exception(
            db,
            exception_id=payload.location_exception_id,
            requested_by=current_user.id,
            target_type="doctor_visit",
            target_id=visit.id,
            action="punch_out",
            latitude=payload.latitude,
            longitude=payload.longitude,
            verification_message=str(exc),
        )

    punched_out_at = datetime.now(timezone.utc)
    visit.punch_out_time = punched_out_at
    visit.punch_out_latitude = payload.latitude
    visit.punch_out_longitude = payload.longitude
    visit.treatment_duration = elapsed_seconds(
        visit.punch_in_time,
        punched_out_at,
    )
    visit.session_status = "COMPLETED"
    apply_doctor_visit_status(
        visit,
        "visited",
        remarks=payload.remarks,
        completed_at=punched_out_at,
    )
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="doctor_visit",
        entity_id=visit.id,
        action="completed",
        business_date=visit.visit_date,
        from_state="in_progress",
        to_state="completed",
        related_entity_type="doctor_workday",
        related_entity_id=workday.id,
        details={
            "duration_seconds": int(visit.treatment_duration or 0),
            "location_exception_id": (
                exception_used.id if exception_used is not None else None
            ),
        },
    )
    db.commit()
    db.refresh(visit)
    return _session_response(
        visit,
        workday_started=True,
        location_verified=exception_used is None,
        can_punch_in=False,
        can_punch_out=False,
        eligibility_message=(
            "Visit completed with an approved location exception."
            if exception_used is not None
            else "Visit completed."
        ),
        location_policy=location_policy,
    )
