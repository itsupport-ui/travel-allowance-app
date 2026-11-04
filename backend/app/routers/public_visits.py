from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.freelance_visit import FreelanceVisit
from app.schemas.freelance import PublicVisitView
from app.services.doctor_attendance_service import elapsed_seconds
from app.services.freelance_link_service import as_utc, hash_token
from app.services.location_exception_service import (
    validate_action_location_evidence,
)
from app.services.location_policy_service import get_location_policy
from app.services.schedule_location_service import (
    has_valid_coordinates,
    validate_patient_arrival,
)
from app.utils.domain_errors import DomainHTTPException
from app.utils.rate_limit import SlidingWindowLimiter, rate_limit_by_ip
from app.utils.timezone import india_now
from app.utils.uploads import (
    UploadValidationError,
    delete_stored_upload,
    store_validated_upload,
)

PROOF_SUBDIRECTORY = "freelance_visits"

# 60 requests per minute per address is far above real use of one link.
_limiter = SlidingWindowLimiter(max_calls=60, window_seconds=60)

router = APIRouter(
    prefix="/public/visits",
    tags=["Public Freelance Visit"],
    dependencies=[Depends(rate_limit_by_ip(_limiter))],
)

def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="This link is not valid or has expired.",
    )


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _load(db: Session, token: str, *, for_update: bool = False) -> FreelanceVisit:
    """Resolve a token to its visit; every failure looks the same."""
    query = db.query(FreelanceVisit).options(joinedload(FreelanceVisit.freelancer))
    if for_update:
        query = query.with_for_update(of=FreelanceVisit)
    visit = query.filter(FreelanceVisit.token_hash == hash_token(token)).first()
    if (
        visit is None
        or visit.status == "cancelled"
        or as_utc(visit.token_expires_at) <= datetime.now(timezone.utc)
    ):
        raise _not_found()
    return visit


def _maps_url(visit: FreelanceVisit) -> str:
    if has_valid_coordinates(visit.patient_latitude, visit.patient_longitude):
        query = f"{visit.patient_latitude},{visit.patient_longitude}"
    else:
        query = quote(visit.patient_address)
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def _view(visit: FreelanceVisit) -> PublicVisitView:
    return PublicVisitView(
        freelancer_name=visit.freelancer.name,
        patient_name=visit.patient_name,
        patient_phone=visit.patient_phone,
        patient_address=visit.patient_address,
        maps_url=_maps_url(visit),
        treatment_name=visit.treatment_name,
        instructions=visit.instructions,
        visit_date=visit.visit_date,
        start_time=visit.start_time,
        end_time=visit.end_time,
        fee_amount=visit.fee_amount,
        status=visit.status,
        punch_in_time=visit.punch_in_time,
        punch_out_time=visit.punch_out_time,
        location_unverified=bool(visit.location_unverified),
    )


def _location_problem(
    db: Session,
    visit: FreelanceVisit,
    *,
    latitude: float | None,
    longitude: float | None,
    gps_accuracy_m: float | None,
    device_timestamp: datetime | None,
) -> str | None:
    """Return why the location cannot be verified, or None when it can."""
    if latitude is None or longitude is None:
        return "Your location could not be read from the phone."
    if not has_valid_coordinates(latitude, longitude):
        return "The captured current location is invalid."
    policy = get_location_policy(db, india_now().date())
    try:
        validate_action_location_evidence(
            device_timestamp=device_timestamp,
            gps_accuracy_m=gps_accuracy_m,
            accuracy_threshold_m=policy.gps_accuracy_threshold_m,
            max_age_minutes=policy.evidence_max_age_minutes,
        )
        validate_patient_arrival(
            arrival_latitude=latitude,
            arrival_longitude=longitude,
            patient_latitude=visit.patient_latitude,
            patient_longitude=visit.patient_longitude,
            radius_km=policy.geofence_radius_m / 1000,
        )
    except (ValueError, HTTPException) as error:
        return str(getattr(error, "detail", error))
    return None


def _resolve_location(
    db: Session,
    visit: FreelanceVisit,
    *,
    reason: str | None,
    **evidence,
) -> str | None:
    """Return a note to store when unverified; raise when a reason is due."""
    problem = _location_problem(db, visit, **evidence)
    if problem is None:
        return None
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="LOCATION_REASON_REQUIRED",
            message=problem,
            recoverable=True,
            suggested_action="enter_reason",
            blocking_fields=["reason"],
        )
    return f"{problem} Reason given: {reason[:300]}"


def _append_note(visit: FreelanceVisit, label: str, note: str | None) -> None:
    if note is None:
        return
    visit.location_unverified = True
    entry = f"[{label}] {note}"
    visit.unverified_reason = (
        f"{visit.unverified_reason}\n{entry}" if visit.unverified_reason else entry
    )


# --------------------------------------------------------------------------
# endpoints
# --------------------------------------------------------------------------
@router.get("/{token}", response_model=PublicVisitView)
def view_visit(token: str, db: Session = Depends(get_db)):
    return _view(_load(db, token))


@router.post("/{token}/start", response_model=PublicVisitView)
def start_visit(
    token: str,
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    gps_accuracy_m: float | None = Form(default=None, gt=0, le=5000),
    device_timestamp: datetime | None = Form(default=None),
    reason: str | None = Form(default=None, max_length=300),
    db: Session = Depends(get_db),
):
    visit = _load(db, token, for_update=True)
    if visit.status != "assigned":
        # Already started or finished: a repeated tap just shows the state.
        return _view(visit)
    if visit.visit_date != india_now().date():
        raise HTTPException(
            status_code=400,
            detail=(
                "You can start only on the visit date "
                f"({visit.visit_date.strftime('%d %b %Y')})."
            ),
        )
    busy = (
        db.query(FreelanceVisit.id)
        .filter(
            FreelanceVisit.freelancer_id == visit.freelancer_id,
            FreelanceVisit.status == "in_progress",
            FreelanceVisit.id != visit.id,
        )
        .first()
    )
    if busy is not None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="ANOTHER_VISIT_IS_ACTIVE",
            message="Finish your other visit before starting this one.",
            recoverable=True,
            suggested_action="finish_active_visit",
        )

    note = _resolve_location(
        db,
        visit,
        reason=reason,
        latitude=latitude,
        longitude=longitude,
        gps_accuracy_m=gps_accuracy_m,
        device_timestamp=device_timestamp,
    )
    visit.punch_in_time = datetime.now(timezone.utc)
    visit.punch_in_latitude = latitude
    visit.punch_in_longitude = longitude
    visit.punch_in_accuracy_m = gps_accuracy_m
    visit.status = "in_progress"
    _append_note(visit, "start", note)
    db.commit()
    db.refresh(visit)
    return _view(visit)


@router.post("/{token}/finish", response_model=PublicVisitView)
def finish_visit(
    token: str,
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    gps_accuracy_m: float | None = Form(default=None, gt=0, le=5000),
    device_timestamp: datetime | None = Form(default=None),
    reason: str | None = Form(default=None, max_length=300),
    notes: str | None = Form(default=None, max_length=1000),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    visit = _load(db, token, for_update=True)
    if visit.status in {"completed", "approved", "paid"}:
        return _view(visit)
    if visit.status != "in_progress" or visit.punch_in_time is None:
        raise DomainHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="VISIT_NOT_STARTED",
            message="Start the visit before finishing it.",
            recoverable=True,
            suggested_action="start_visit",
        )

    note = _resolve_location(
        db,
        visit,
        reason=reason,
        latitude=latitude,
        longitude=longitude,
        gps_accuracy_m=gps_accuracy_m,
        device_timestamp=device_timestamp,
    )
    try:
        stored = store_validated_upload(photo, subdirectory=PROOF_SUBDIRECTORY)
    except UploadValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    try:
        finished_at = datetime.now(timezone.utc)
        visit.punch_out_time = finished_at
        visit.punch_out_latitude = latitude
        visit.punch_out_longitude = longitude
        visit.punch_out_accuracy_m = gps_accuracy_m
        visit.duration_seconds = elapsed_seconds(visit.punch_in_time, finished_at)
        visit.status = "completed"
        visit.proof_file = str(stored)
        visit.completion_notes = notes.strip() if notes else None
        _append_note(visit, "finish", note)
        db.commit()
    except Exception:
        db.rollback()
        delete_stored_upload(stored, PROOF_SUBDIRECTORY)
        raise
    db.refresh(visit)
    return _view(visit)
