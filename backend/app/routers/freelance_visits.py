from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.doctor import Doctor
from app.models.freelance_therapist import FreelanceTherapist
from app.models.freelance_visit import FreelanceVisit
from app.models.user import User
from app.schemas.freelance import (
    FreelanceVisitCancel,
    FreelanceVisitCreate,
    FreelanceVisitCreated,
    FreelanceVisitMarkPaid,
    FreelanceVisitReassign,
    FreelanceVisitResponse,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.services.freelance_link_service import (
    link_is_live,
    new_token,
    token_expiry,
    visit_link,
    whatsapp_message,
    whatsapp_url,
)
from app.services.schedule_location_service import resolve_patient_coordinates
from app.utils.auth import require_permission
from app.utils.timezone import india_now
from app.utils.uploads import resolve_stored_upload

router = APIRouter(prefix="/freelance-visits", tags=["Freelance Visits"])

PROOF_SUBDIRECTORY = "freelance_visits"
STATUSES = {
    "assigned",
    "in_progress",
    "completed",
    "approved",
    "paid",
    "cancelled",
}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def visit_response(visit: FreelanceVisit) -> FreelanceVisitResponse:
    freelancer = visit.freelancer
    return FreelanceVisitResponse(
        id=visit.id,
        freelancer_id=visit.freelancer_id,
        freelancer_name=freelancer.name,
        freelancer_phone=freelancer.phone,
        freelancer_upi_id=freelancer.upi_id,
        patient_name=visit.patient_name,
        patient_phone=visit.patient_phone,
        patient_address=visit.patient_address,
        treatment_name=visit.treatment_name,
        instructions=visit.instructions,
        visit_date=visit.visit_date,
        start_time=visit.start_time,
        end_time=visit.end_time,
        fee_amount=visit.fee_amount,
        status=visit.status,
        punch_in_time=visit.punch_in_time,
        punch_out_time=visit.punch_out_time,
        duration_seconds=visit.duration_seconds,
        location_unverified=bool(visit.location_unverified),
        unverified_reason=visit.unverified_reason,
        has_proof=bool(visit.proof_file),
        completion_notes=visit.completion_notes,
        cancel_reason=visit.cancel_reason,
        approved_at=visit.approved_at,
        paid_at=visit.paid_at,
        payment_reference=visit.payment_reference,
        link_active=link_is_live(visit),
    )


def _created_response(visit: FreelanceVisit, token: str) -> FreelanceVisitCreated:
    link = visit_link(token)
    message = whatsapp_message(
        freelancer_name=visit.freelancer.name,
        visit_date=visit.visit_date,
        start_time=visit.start_time,
        treatment_name=visit.treatment_name,
        fee_amount=visit.fee_amount,
        link=link,
    )
    return FreelanceVisitCreated(
        visit=visit_response(visit),
        link=link,
        whatsapp_url=whatsapp_url(visit.freelancer.phone, message),
        message=message,
    )


def _get_visit(db: Session, visit_id: int, *, for_update: bool = False):
    query = db.query(FreelanceVisit).options(joinedload(FreelanceVisit.freelancer))
    if for_update:
        query = query.with_for_update(of=FreelanceVisit)
    visit = query.filter(FreelanceVisit.id == visit_id).first()
    if visit is None:
        raise HTTPException(status_code=404, detail="Freelance visit not found.")
    return visit


def _active_freelancer(db: Session, freelancer_id: int) -> FreelanceTherapist:
    freelancer = db.get(FreelanceTherapist, freelancer_id)
    if freelancer is None or not freelancer.active:
        raise HTTPException(
            status_code=400,
            detail="Choose an active freelancer from the directory.",
        )
    return freelancer


def _audit(db, user, visit, action, from_state=None, to_state=None, **details):
    record_domain_audit_event(
        db,
        actor_id=user.id,
        actor_role=user.role,
        domain="clinical",
        entity_type="freelance_visit",
        entity_id=visit.id,
        action=action,
        business_date=visit.visit_date,
        from_state=from_state,
        to_state=to_state,
        details={"fee_amount": str(visit.fee_amount), **details},
    )


def _revoke_link(visit: FreelanceVisit) -> None:
    visit.token_expires_at = datetime.now(timezone.utc)


def _csv_cell(value) -> str:
    text = "" if value is None else str(value)
    # Neutralise spreadsheet formula injection from free-text fields.
    if text[:1] in {"=", "+", "-", "@"}:
        return "'" + text
    return text


# --------------------------------------------------------------------------
# assigner endpoints
# --------------------------------------------------------------------------
@router.post(
    "",
    response_model=FreelanceVisitCreated,
    status_code=status.HTTP_201_CREATED,
)
def assign_visit(
    payload: FreelanceVisitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    if payload.visit_date < india_now().date():
        raise HTTPException(
            status_code=400,
            detail="The visit date cannot be in the past.",
        )
    if (
        payload.start_time is not None
        and payload.end_time is not None
        and payload.end_time <= payload.start_time
    ):
        raise HTTPException(
            status_code=400,
            detail="The end time must be after the start time.",
        )
    freelancer = _active_freelancer(db, payload.freelancer_id)
    if payload.doctor_id is not None and db.get(Doctor, payload.doctor_id) is None:
        raise HTTPException(status_code=400, detail="Doctor not found.")

    latitude, longitude = payload.patient_latitude, payload.patient_longitude
    if latitude is None or longitude is None:
        # Without coordinates the visit still works; punches are then flagged
        # as location-unverified for the payout reviewer.
        try:
            latitude, longitude = resolve_patient_coordinates(
                payload.patient_address
            )
        except Exception:
            latitude = longitude = None

    token, token_hash = new_token()
    visit = FreelanceVisit(
        freelancer_id=freelancer.id,
        patient_name=payload.patient_name.strip(),
        patient_phone=payload.patient_phone,
        patient_address=payload.patient_address.strip(),
        patient_latitude=latitude,
        patient_longitude=longitude,
        treatment_name=payload.treatment_name.strip(),
        instructions=payload.instructions,
        visit_date=payload.visit_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        doctor_id=payload.doctor_id,
        treatment_plan_id=payload.treatment_plan_id,
        fee_amount=payload.fee_amount,
        token_hash=token_hash,
        token_expires_at=token_expiry(payload.visit_date),
        created_by=current_user.id,
    )
    db.add(visit)
    db.flush()
    _audit(db, current_user, visit, "assigned", to_state="assigned")
    db.commit()
    db.refresh(visit)
    return _created_response(visit, token)


@router.get("", response_model=list[FreelanceVisitResponse])
def list_visits(
    status_filter: str | None = Query(default=None, alias="status"),
    freelancer_id: int | None = Query(default=None, ge=1),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    if status_filter is not None and status_filter not in STATUSES:
        raise HTTPException(status_code=422, detail="Unknown status filter.")
    query = db.query(FreelanceVisit).options(joinedload(FreelanceVisit.freelancer))
    if status_filter:
        query = query.filter(FreelanceVisit.status == status_filter)
    if freelancer_id:
        query = query.filter(FreelanceVisit.freelancer_id == freelancer_id)
    if date_from:
        query = query.filter(FreelanceVisit.visit_date >= date_from)
    if date_to:
        query = query.filter(FreelanceVisit.visit_date <= date_to)
    visits = (
        query.order_by(FreelanceVisit.visit_date.desc(), FreelanceVisit.id.desc())
        .limit(500)
        .all()
    )
    return [visit_response(visit) for visit in visits]


@router.get("/export")
def export_payouts(
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("freelance_payouts.manage")),
):
    query = db.query(FreelanceVisit).options(joinedload(FreelanceVisit.freelancer))
    query = query.filter(
        FreelanceVisit.status.in_(
            [status_filter] if status_filter else ["completed", "approved", "paid"]
        )
    )
    if date_from:
        query = query.filter(FreelanceVisit.visit_date >= date_from)
    if date_to:
        query = query.filter(FreelanceVisit.visit_date <= date_to)
    visits = query.order_by(FreelanceVisit.visit_date, FreelanceVisit.id).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Visit ID",
            "Date",
            "Freelancer",
            "Mobile",
            "UPI ID",
            "Patient",
            "Treatment",
            "Fee",
            "Status",
            "Location verified",
            "Payment reference",
        ]
    )
    for visit in visits:
        writer.writerow(
            [
                _csv_cell(value)
                for value in (
                    visit.id,
                    visit.visit_date.isoformat(),
                    visit.freelancer.name,
                    visit.freelancer.phone,
                    visit.freelancer.upi_id,
                    visit.patient_name,
                    visit.treatment_name,
                    f"{visit.fee_amount:.2f}",
                    visit.status,
                    "No" if visit.location_unverified else "Yes",
                    visit.payment_reference,
                )
            ]
        )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="freelance-payouts.csv"'
        },
    )


@router.get("/{visit_id}", response_model=FreelanceVisitResponse)
def get_visit(
    visit_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    return visit_response(_get_visit(db, visit_id))


@router.post("/{visit_id}/cancel", response_model=FreelanceVisitResponse)
def cancel_visit(
    visit_id: int,
    payload: FreelanceVisitCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    visit = _get_visit(db, visit_id, for_update=True)
    if visit.status not in {"assigned", "in_progress"}:
        raise HTTPException(
            status_code=400,
            detail="Only visits that are not yet completed can be cancelled.",
        )
    previous = visit.status
    visit.status = "cancelled"
    visit.cancel_reason = payload.reason.strip()
    _revoke_link(visit)
    _audit(
        db,
        current_user,
        visit,
        "cancelled",
        from_state=previous,
        to_state="cancelled",
    )
    db.commit()
    db.refresh(visit)
    return visit_response(visit)


@router.post("/{visit_id}/reassign", response_model=FreelanceVisitCreated)
def reassign_visit(
    visit_id: int,
    payload: FreelanceVisitReassign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    visit = _get_visit(db, visit_id, for_update=True)
    if visit.status != "assigned":
        raise HTTPException(
            status_code=400,
            detail="Only visits that have not started can be reassigned.",
        )
    freelancer = _active_freelancer(db, payload.freelancer_id)
    visit.freelancer_id = freelancer.id
    visit.freelancer = freelancer
    if payload.fee_amount is not None:
        visit.fee_amount = payload.fee_amount
    token, token_hash = new_token()
    visit.token_hash = token_hash
    visit.token_expires_at = token_expiry(visit.visit_date)
    _audit(
        db,
        current_user,
        visit,
        "reassigned",
        from_state="assigned",
        to_state="assigned",
        freelancer_id=freelancer.id,
    )
    db.commit()
    db.refresh(visit)
    return _created_response(visit, token)


@router.post("/{visit_id}/new-link", response_model=FreelanceVisitCreated)
def issue_new_link(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    """Links are stored hashed, so resending means minting a fresh one."""
    visit = _get_visit(db, visit_id, for_update=True)
    if visit.status not in {"assigned", "in_progress"}:
        raise HTTPException(
            status_code=400,
            detail="A new link is only available for open visits.",
        )
    token, token_hash = new_token()
    visit.token_hash = token_hash
    visit.token_expires_at = token_expiry(visit.visit_date)
    _audit(db, current_user, visit, "link_reissued")
    db.commit()
    db.refresh(visit)
    return _created_response(visit, token)


@router.get("/{visit_id}/proof")
def get_visit_proof(
    visit_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("freelance_visits.assign")),
):
    visit = _get_visit(db, visit_id)
    if not visit.proof_file:
        raise HTTPException(status_code=404, detail="No proof was uploaded.")
    try:
        path = resolve_stored_upload(visit.proof_file, PROOF_SUBDIRECTORY)
    except (FileNotFoundError, ValueError, OSError) as error:
        raise HTTPException(
            status_code=404,
            detail="The proof file is no longer available.",
        ) from error
    return FileResponse(path)


# --------------------------------------------------------------------------
# payout endpoints (admin)
# --------------------------------------------------------------------------
@router.post("/{visit_id}/approve", response_model=FreelanceVisitResponse)
def approve_visit(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelance_payouts.manage")),
):
    visit = _get_visit(db, visit_id, for_update=True)
    if visit.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Only completed visits can be approved.",
        )
    visit.status = "approved"
    visit.approved_by = current_user.id
    visit.approved_at = datetime.now(timezone.utc)
    _audit(
        db,
        current_user,
        visit,
        "approved",
        from_state="completed",
        to_state="approved",
        location_unverified=bool(visit.location_unverified),
    )
    db.commit()
    db.refresh(visit)
    return visit_response(visit)


@router.post("/{visit_id}/mark-paid", response_model=FreelanceVisitResponse)
def mark_visit_paid(
    visit_id: int,
    payload: FreelanceVisitMarkPaid,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("freelance_payouts.manage")),
):
    visit = _get_visit(db, visit_id, for_update=True)
    if visit.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="Approve the visit before marking it paid.",
        )
    visit.status = "paid"
    visit.paid_by = current_user.id
    visit.paid_at = datetime.now(timezone.utc)
    visit.payment_reference = payload.payment_reference.strip()
    _audit(
        db,
        current_user,
        visit,
        "paid",
        from_state="approved",
        to_state="paid",
    )
    db.commit()
    db.refresh(visit)
    return visit_response(visit)
