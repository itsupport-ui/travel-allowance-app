from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.location_exception_request import LocationExceptionRequest
from app.services.maps_service import straight_line_distance_km
from app.services.location_policy_service import (
    DEFAULT_APPROVAL_VALID_HOURS,
    DEFAULT_EVIDENCE_MAX_AGE_MINUTES,
    DEFAULT_GEOFENCE_RADIUS_M,
    DEFAULT_GPS_ACCURACY_THRESHOLD_M,
    DEFAULT_MAX_EVIDENCE_MOVEMENT_M,
)
from app.utils.domain_errors import DomainHTTPException
from app.utils.timezone import india_now
from app.services.domain_audit_service import record_domain_audit_event


GEOFENCE_RADIUS_M = DEFAULT_GEOFENCE_RADIUS_M
EVIDENCE_MAX_AGE_MINUTES = DEFAULT_EVIDENCE_MAX_AGE_MINUTES
EVIDENCE_MAX_FUTURE_MINUTES = 2
APPROVAL_VALID_HOURS = DEFAULT_APPROVAL_VALID_HOURS
MAX_EVIDENCE_MOVEMENT_KM = DEFAULT_MAX_EVIDENCE_MOVEMENT_M / 1000


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def validate_evidence_timestamp(
    value: datetime,
    *,
    max_age_minutes: int = EVIDENCE_MAX_AGE_MINUTES,
) -> datetime:
    captured_at = _as_utc(value)
    now = datetime.now(timezone.utc)
    if captured_at < now - timedelta(minutes=max_age_minutes):
        raise DomainHTTPException(
            status_code=422,
            code="LOCATION_EVIDENCE_STALE",
            message="Capture a fresh GPS position before requesting an exception.",
            recoverable=True,
            suggested_action="capture_location_again",
            blocking_fields=["device_timestamp"],
        )
    if captured_at > now + timedelta(minutes=EVIDENCE_MAX_FUTURE_MINUTES):
        raise DomainHTTPException(
            status_code=422,
            code="LOCATION_DEVICE_TIME_INVALID",
            message="The device time is ahead of the server. Correct it and try again.",
            recoverable=True,
            suggested_action="correct_device_time",
            blocking_fields=["device_timestamp"],
        )
    return captured_at


def evidence_quality(
    gps_accuracy_m: float,
    *,
    accuracy_threshold_m: float = DEFAULT_GPS_ACCURACY_THRESHOLD_M,
) -> str:
    if gps_accuracy_m <= min(100, accuracy_threshold_m / 2):
        return "good"
    if gps_accuracy_m <= accuracy_threshold_m:
        return "limited"
    return "poor"


def validate_action_location_evidence(
    *,
    device_timestamp: datetime | None,
    gps_accuracy_m: float | None,
    accuracy_threshold_m: float,
    max_age_minutes: int,
) -> None:
    """Validate evidence supplied by current clients while allowing legacy pairs.

    Older clients that omit accuracy (but may already send a timestamp)
    continue through the coordinate geofence during the rollout. Once a
    client supplies accuracy, it must also supply a fresh timestamp.
    """
    if gps_accuracy_m is None:
        return
    if device_timestamp is None:
        raise DomainHTTPException(
            status_code=422,
            code="LOCATION_EVIDENCE_INCOMPLETE",
            message="Capture a complete GPS reading and try again.",
            recoverable=True,
            suggested_action="capture_location_again",
            blocking_fields=["device_timestamp", "gps_accuracy_m"],
        )
    validate_evidence_timestamp(
        device_timestamp,
        max_age_minutes=max_age_minutes,
    )
    if gps_accuracy_m <= 0 or gps_accuracy_m > 5000:
        raise DomainHTTPException(
            status_code=422,
            code="LOCATION_ACCURACY_INVALID",
            message="The GPS accuracy value is invalid. Capture location again.",
            recoverable=True,
            suggested_action="capture_location_again",
            blocking_fields=["gps_accuracy_m"],
        )
    if gps_accuracy_m > accuracy_threshold_m:
        raise ValueError(
            f"GPS accuracy is approximately {gps_accuracy_m:.0f} metres; "
            f"the configured limit is {accuracy_threshold_m:.0f} metres."
        )


def target_values(
    exception: LocationExceptionRequest,
) -> tuple[str, int]:
    if exception.schedule_id is not None:
        return "therapist_schedule", exception.schedule_id
    return "doctor_visit", int(exception.doctor_visit_id)


def build_active_key(
    *,
    requested_by: int,
    target_type: str,
    target_id: int,
    action: str,
) -> str:
    return f"{requested_by}:{target_type}:{target_id}:{action}"


def expire_stale_requests(db: Session) -> int:
    today = india_now().date()
    stale = (
        db.query(LocationExceptionRequest)
        .filter(
            LocationExceptionRequest.active_key.is_not(None),
            LocationExceptionRequest.business_date < today,
            LocationExceptionRequest.status.in_(["pending", "approved"]),
        )
        .all()
    )
    for request in stale:
        request.status = "expired"
        request.active_key = None
        request.version += 1
    if stale:
        db.commit()
    return len(stale)


def get_active_request(
    db: Session,
    *,
    requested_by: int,
    target_type: str,
    target_id: int,
    action: str,
) -> LocationExceptionRequest | None:
    key = build_active_key(
        requested_by=requested_by,
        target_type=target_type,
        target_id=target_id,
        action=action,
    )
    return (
        db.query(LocationExceptionRequest)
        .filter(LocationExceptionRequest.active_key == key)
        .first()
    )


def consume_approved_exception(
    db: Session,
    *,
    exception_id: int | None,
    requested_by: int,
    target_type: str,
    target_id: int,
    action: str,
    latitude: float,
    longitude: float,
    verification_message: str | None = None,
) -> LocationExceptionRequest:
    if exception_id is None:
        raise DomainHTTPException(
            status_code=400,
            code="LOCATION_VERIFICATION_FAILED",
            message=(
                f"{verification_message} Request an exception for administrator "
                "review if you cannot resolve the GPS issue."
                if verification_message
                else "Location verification failed. Request an exception for "
                "administrator review if you cannot resolve the GPS issue."
            ),
            recoverable=True,
            suggested_action="request_location_exception",
            blocking_fields=["location_exception_id"],
        )

    exception = (
        db.query(LocationExceptionRequest)
        .filter(LocationExceptionRequest.id == exception_id)
        .with_for_update()
        .first()
    )
    if exception is None:
        raise DomainHTTPException(
            status_code=404,
            code="LOCATION_EXCEPTION_NOT_FOUND",
            message="The location exception request was not found.",
            recoverable=True,
            suggested_action="refresh_location_exception",
        )

    exception_target_type, exception_target_id = target_values(exception)
    if (
        exception.requested_by != requested_by
        or exception_target_type != target_type
        or exception_target_id != target_id
        or exception.action != action
    ):
        raise DomainHTTPException(
            status_code=403,
            code="LOCATION_EXCEPTION_SCOPE_MISMATCH",
            message="This approval does not belong to this staff action.",
            recoverable=False,
            suggested_action="request_location_exception",
        )
    if exception.status != "approved":
        raise DomainHTTPException(
            status_code=409,
            code="LOCATION_EXCEPTION_NOT_APPROVED",
            message=f"The location exception is {exception.status}.",
            recoverable=True,
            suggested_action="view_location_exception_status",
            blocking_fields=["location_exception_status"],
        )
    now = datetime.now(timezone.utc)
    reviewed_at = (
        _as_utc(exception.reviewed_at)
        if exception.reviewed_at is not None
        else None
    )
    if (
        exception.business_date != india_now().date()
        or reviewed_at is None
        or reviewed_at < now - timedelta(
            hours=(
                exception.approval_valid_hours
                or APPROVAL_VALID_HOURS
            )
        )
    ):
        raise DomainHTTPException(
            status_code=410,
            code="LOCATION_EXCEPTION_EXPIRED",
            message="This location approval has expired. Request a new review.",
            recoverable=True,
            suggested_action="request_location_exception",
        )

    movement_km = straight_line_distance_km(
        exception.captured_latitude,
        exception.captured_longitude,
        latitude,
        longitude,
    )
    max_movement_km = (
        exception.max_evidence_movement_m
        or DEFAULT_MAX_EVIDENCE_MOVEMENT_M
    ) / 1000
    if movement_km > max_movement_km:
        raise DomainHTTPException(
            status_code=409,
            code="LOCATION_EXCEPTION_EVIDENCE_CHANGED",
            message=(
                "Your current position differs from the approved evidence. "
                "Capture a new location and request another review."
            ),
            recoverable=True,
            suggested_action="request_location_exception",
            blocking_fields=["latitude", "longitude"],
        )

    exception.status = "used"
    exception.used_at = now
    exception.active_key = None
    exception.version += 1
    record_domain_audit_event(
        db,
        actor_id=requested_by,
        domain="location",
        entity_type="location_exception",
        entity_id=exception.id,
        action="used",
        business_date=exception.business_date,
        from_state="approved",
        to_state="used",
        reason_code="one_time_exception_consumed",
        related_entity_type=target_type,
        related_entity_id=target_id,
        details={
            "field_action": action,
            "review_version": exception.version,
        },
    )
    return exception
