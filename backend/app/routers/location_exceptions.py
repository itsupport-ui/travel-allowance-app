from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor_visit import DoctorVisit
from app.models.location_exception_request import LocationExceptionRequest
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.schemas.location_exception import (
    LocationExceptionCreate,
    LocationExceptionDecision,
    LocationExceptionResponse,
)
from app.services.doctor_attendance_service import (
    ensure_visit_coordinates,
    get_current_doctor,
    get_doctor_workday,
)
from app.services.location_exception_service import (
    build_active_key,
    evidence_quality,
    expire_stale_requests,
    get_active_request,
    target_values,
    validate_action_location_evidence,
    validate_evidence_timestamp,
)
from app.services.location_policy_service import get_location_policy
from app.services.domain_audit_service import record_domain_audit_event
from app.services.maps_service import straight_line_distance_km
from app.services.schedule_location_service import (
    has_valid_coordinates,
    validate_patient_arrival,
)
from app.utils.auth import require_permission, require_role
from app.utils.domain_errors import DomainHTTPException
from app.utils.timezone import india_now


router = APIRouter(
    prefix="/location-exceptions",
    tags=["Location Exceptions"],
)
VALID_STATUSES = {"pending", "approved", "rejected", "used", "expired"}


def _occurs_today(schedule: TreatmentSchedule) -> bool:
    today = india_now().date()
    if schedule.schedule_type == "one_time":
        return schedule.treatment_date == today
    return bool(
        schedule.start_date
        and schedule.end_date
        and schedule.start_date <= today <= schedule.end_date
    )


def _target_coordinates_and_validate_state(
    db: Session,
    *,
    current_user: User,
    payload: LocationExceptionCreate,
) -> tuple[float | None, float | None]:
    today = india_now().date()
    if current_user.role == "therapist":
        if payload.target_type != "therapist_schedule":
            raise HTTPException(status_code=403, detail="Access denied.")
        schedule = (
            db.query(TreatmentSchedule)
            .filter(
                TreatmentSchedule.id == payload.target_id,
                TreatmentSchedule.therapist_id == current_user.id,
            )
            .first()
        )
        if schedule is None:
            raise HTTPException(status_code=404, detail="Schedule not found.")
        workday_active = (
            db.query(TherapistWorkDay.id)
            .filter(
                TherapistWorkDay.therapist_id == current_user.id,
                TherapistWorkDay.work_date == today,
                TherapistWorkDay.is_active.is_(True),
            )
            .first()
            is not None
        )
        if not workday_active:
            raise DomainHTTPException(
                status_code=400,
                code="WORKDAY_NOT_ACTIVE",
                message="Start your workday before requesting an exception.",
                recoverable=True,
                suggested_action="start_workday",
            )
        if schedule.status != "scheduled" or not _occurs_today(schedule):
            raise DomainHTTPException(
                status_code=409,
                code="SCHEDULE_NOT_EXCEPTION_ELIGIBLE",
                message="This schedule is not eligible for a location exception today.",
                recoverable=False,
                suggested_action="view_schedule_status",
            )
        expected_session = (
            "NOT_STARTED" if payload.action == "punch_in" else "IN_PROGRESS"
        )
        if schedule.session_status != expected_session:
            raise DomainHTTPException(
                status_code=409,
                code="SESSION_NOT_EXCEPTION_ELIGIBLE",
                message=f"The treatment is not ready for {payload.action.replace('_', ' ')}.",
                recoverable=True,
                suggested_action="refresh_treatment_session",
            )
        return schedule.patient_latitude, schedule.patient_longitude

    if payload.target_type != "doctor_visit":
        raise HTTPException(status_code=403, detail="Access denied.")
    doctor = get_current_doctor(db, current_user)
    visit = (
        db.query(DoctorVisit)
        .filter(
            DoctorVisit.id == payload.target_id,
            DoctorVisit.doctor_id == doctor.id,
        )
        .first()
    )
    if visit is None:
        raise HTTPException(status_code=404, detail="Doctor visit not found.")
    if get_doctor_workday(db, doctor.id, today, active_only=True) is None:
        raise DomainHTTPException(
            status_code=400,
            code="WORKDAY_NOT_ACTIVE",
            message="Start your workday before requesting an exception.",
            recoverable=True,
            suggested_action="start_workday",
        )
    if visit.visit_date != today or visit.status != "scheduled":
        raise DomainHTTPException(
            status_code=409,
            code="VISIT_NOT_EXCEPTION_ELIGIBLE",
            message="This visit is not eligible for a location exception today.",
            recoverable=False,
            suggested_action="view_visit_status",
        )
    expected_session = (
        "NOT_STARTED" if payload.action == "punch_in" else "IN_PROGRESS"
    )
    if visit.session_status != expected_session:
        raise DomainHTTPException(
            status_code=409,
            code="SESSION_NOT_EXCEPTION_ELIGIBLE",
            message=f"The visit is not ready for {payload.action.replace('_', ' ')}.",
            recoverable=True,
            suggested_action="refresh_visit_session",
        )
    try:
        return ensure_visit_coordinates(visit)
    except ValueError:
        db.rollback()
        return visit.patient_latitude, visit.patient_longitude


def _to_response(
    db: Session,
    request: LocationExceptionRequest,
    *,
    admin_view: bool,
) -> LocationExceptionResponse:
    target_type, target_id = target_values(request)
    requester = db.query(User).filter(User.id == request.requested_by).first()
    reviewer = (
        db.query(User).filter(User.id == request.reviewed_by).first()
        if request.reviewed_by is not None
        else None
    )
    actions: list[str] = []
    if admin_view and request.status == "pending":
        actions = ["approve", "reject"]
    elif not admin_view and request.status == "approved":
        actions = [f"use_for_{request.action}"]
    elif not admin_view and request.status in {"rejected", "expired"}:
        actions = ["request_again"]
    return LocationExceptionResponse(
        id=request.id,
        requested_by=request.requested_by,
        requester_name=requester.username if requester else None,
        staff_role=request.staff_role,
        target_type=target_type,
        target_id=target_id,
        action=request.action,
        business_date=request.business_date,
        reason=request.reason,
        captured_latitude=request.captured_latitude,
        captured_longitude=request.captured_longitude,
        gps_accuracy_m=request.gps_accuracy_m,
        device_timestamp=request.device_timestamp,
        distance_km=request.distance_km,
        geofence_radius_m=request.geofence_radius_m,
        location_policy_id=request.location_policy_id,
        location_policy_version=request.location_policy_version,
        gps_accuracy_threshold_m=request.gps_accuracy_threshold_m,
        evidence_max_age_minutes=request.evidence_max_age_minutes,
        approval_valid_hours=request.approval_valid_hours,
        max_evidence_movement_m=request.max_evidence_movement_m,
        evidence_quality=request.evidence_quality,
        status=request.status,
        reviewed_by=request.reviewed_by,
        reviewer_name=reviewer.username if reviewer else None,
        decision_reason=request.decision_reason,
        requested_at=request.requested_at,
        reviewed_at=request.reviewed_at,
        used_at=request.used_at,
        version=request.version,
        available_actions=actions,
    )


@router.post("", response_model=LocationExceptionResponse)
def request_location_exception(
    payload: LocationExceptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist", "doctor"])),
):
    expire_stale_requests(db)
    policy = get_location_policy(db, india_now().date())
    captured_at = validate_evidence_timestamp(
        payload.device_timestamp,
        max_age_minutes=policy.evidence_max_age_minutes,
    )
    patient_latitude, patient_longitude = _target_coordinates_and_validate_state(
        db,
        current_user=current_user,
        payload=payload,
    )
    try:
        validate_action_location_evidence(
            device_timestamp=payload.device_timestamp,
            gps_accuracy_m=payload.gps_accuracy_m,
            accuracy_threshold_m=policy.gps_accuracy_threshold_m,
            max_age_minutes=policy.evidence_max_age_minutes,
        )
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=patient_latitude,
            patient_longitude=patient_longitude,
            radius_km=policy.geofence_radius_m / 1000,
        )
    except ValueError:
        pass
    else:
        raise DomainHTTPException(
            status_code=409,
            code="LOCATION_EXCEPTION_NOT_REQUIRED",
            message="Your current location is already within the allowed radius.",
            recoverable=True,
            suggested_action=payload.action,
        )

    existing = get_active_request(
        db,
        requested_by=current_user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        action=payload.action,
    )
    if existing is not None:
        return _to_response(db, existing, admin_view=False)

    distance_km = None
    if has_valid_coordinates(patient_latitude, patient_longitude):
        distance_km = straight_line_distance_km(
            payload.latitude,
            payload.longitude,
            float(patient_latitude),
            float(patient_longitude),
        )
    request = LocationExceptionRequest(
        requested_by=current_user.id,
        staff_role=current_user.role,
        schedule_id=(
            payload.target_id
            if payload.target_type == "therapist_schedule"
            else None
        ),
        doctor_visit_id=(
            payload.target_id if payload.target_type == "doctor_visit" else None
        ),
        action=payload.action,
        business_date=india_now().date(),
        reason=payload.reason.strip(),
        captured_latitude=payload.latitude,
        captured_longitude=payload.longitude,
        gps_accuracy_m=payload.gps_accuracy_m,
        device_timestamp=captured_at,
        distance_km=distance_km,
        geofence_radius_m=policy.geofence_radius_m,
        evidence_quality=evidence_quality(
            payload.gps_accuracy_m,
            accuracy_threshold_m=policy.gps_accuracy_threshold_m,
        ),
        location_policy_id=policy.id,
        location_policy_version=policy.version,
        gps_accuracy_threshold_m=policy.gps_accuracy_threshold_m,
        evidence_max_age_minutes=policy.evidence_max_age_minutes,
        approval_valid_hours=policy.approval_valid_hours,
        max_evidence_movement_m=policy.max_evidence_movement_m,
        active_key=build_active_key(
            requested_by=current_user.id,
            target_type=payload.target_type,
            target_id=payload.target_id,
            action=payload.action,
        ),
    )
    db.add(request)
    try:
        db.flush()
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="location",
            entity_type="location_exception",
            entity_id=request.id,
            action="requested",
            business_date=request.business_date,
            from_state="not_requested",
            to_state="pending",
            reason_code="location_verification_exception",
            reason=payload.reason,
            related_entity_type=payload.target_type,
            related_entity_id=payload.target_id,
            details={
                "field_action": payload.action,
                "evidence_quality": request.evidence_quality,
                "policy_version": request.location_policy_version,
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = get_active_request(
            db,
            requested_by=current_user.id,
            target_type=payload.target_type,
            target_id=payload.target_id,
            action=payload.action,
        )
        if existing is None:
            raise
        return _to_response(db, existing, admin_view=False)
    db.refresh(request)
    return _to_response(db, request, admin_view=False)


@router.get("/mine", response_model=list[LocationExceptionResponse])
def list_my_location_exceptions(
    status: str = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist", "doctor"])),
):
    expire_stale_requests(db)
    normalized_status = status.strip().lower()
    if normalized_status != "all" and normalized_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid exception status.")
    query = db.query(LocationExceptionRequest).filter(
        LocationExceptionRequest.requested_by == current_user.id,
    )
    if normalized_status != "all":
        query = query.filter(LocationExceptionRequest.status == normalized_status)
    requests = query.order_by(LocationExceptionRequest.requested_at.desc()).all()
    return [_to_response(db, item, admin_view=False) for item in requests]


@router.get("", response_model=list[LocationExceptionResponse])
def list_location_exceptions_for_review(
    status: str = Query(default="pending"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    del current_user
    expire_stale_requests(db)
    normalized_status = status.strip().lower()
    if normalized_status != "all" and normalized_status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid exception status.")
    query = db.query(LocationExceptionRequest)
    if normalized_status != "all":
        query = query.filter(LocationExceptionRequest.status == normalized_status)
    requests = query.order_by(LocationExceptionRequest.requested_at.desc()).all()
    return [_to_response(db, item, admin_view=True) for item in requests]


@router.put("/{request_id}/decision", response_model=LocationExceptionResponse)
def decide_location_exception(
    request_id: int,
    payload: LocationExceptionDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    request = (
        db.query(LocationExceptionRequest)
        .filter(LocationExceptionRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Location exception not found.")
    if request.version != payload.version:
        raise DomainHTTPException(
            status_code=409,
            code="LOCATION_EXCEPTION_VERSION_CONFLICT",
            message="This request changed after it was opened. Refresh and review again.",
            recoverable=True,
            suggested_action="refresh_location_exception",
            blocking_fields=["version"],
        )
    if request.status != "pending":
        raise DomainHTTPException(
            status_code=409,
            code="LOCATION_EXCEPTION_ALREADY_REVIEWED",
            message=f"This request is already {request.status}.",
            recoverable=True,
            suggested_action="refresh_location_exception",
        )
    if request.business_date != india_now().date():
        prior_status = request.status
        request.status = "expired"
        request.active_key = None
        request.version += 1
        target_type, target_id = target_values(request)
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="location",
            entity_type="location_exception",
            entity_id=request.id,
            action="expired_during_review",
            business_date=request.business_date,
            from_state=prior_status,
            to_state="expired",
            reason_code="business_date_expired",
            related_entity_type=target_type,
            related_entity_id=target_id,
        )
        db.commit()
        raise DomainHTTPException(
            status_code=410,
            code="LOCATION_EXCEPTION_EXPIRED",
            message="This request is no longer valid for today's field action.",
            recoverable=False,
            suggested_action="request_location_exception",
        )

    prior_status = request.status
    request.status = payload.decision
    request.reviewed_by = current_user.id
    request.decision_reason = payload.reason.strip()
    request.reviewed_at = datetime.now(timezone.utc)
    request.version += 1
    if payload.decision == "rejected":
        request.active_key = None
    target_type, target_id = target_values(request)
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="location",
        entity_type="location_exception",
        entity_id=request.id,
        action=payload.decision,
        business_date=request.business_date,
        from_state=prior_status,
        to_state=payload.decision,
        reason_code=f"review_{payload.decision}",
        reason=payload.reason,
        related_entity_type=target_type,
        related_entity_id=target_id,
        details={"review_version": request.version},
    )
    db.commit()
    db.refresh(request)
    return _to_response(db, request, admin_view=True)
