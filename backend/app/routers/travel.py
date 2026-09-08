from pathlib import Path
import mimetypes

from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.travel import TravelEntry
from app.models.manual_travel_review_event import ManualTravelReviewEvent
from app.models.user import User
from app.schemas.travel import (
    ManualTravelDecision,
    ManualTravelReviewEventResponse,
    TravelResponse,
)
from app.utils.auth import get_current_user, require_permission, require_role
from sqlalchemy import func
from fastapi import ( Form, File, UploadFile )
from app.utils.timezone import india_now
from app.services.reimbursement_policy_service import (
    CALCULATION_VERSION,
    ROUNDING_MODE,
    decimal_value,
    distance,
    get_reimbursement_policy,
    money,
)
from app.services.domain_audit_service import record_domain_audit_event

from app.utils.uploads import (
    UploadValidationError,
    resolve_stored_upload,
    store_validated_upload,
)

router = APIRouter(
    prefix="/travel",
    tags=["Travel"]
)

ALLOWED_TRANSPORT_MODES = {"vehicle", "auto", "bus", "metro", "cab"}
MANUAL_REVIEW_STATUSES = {
    "pending",
    "approved",
    "changes_requested",
    "cancelled",
}


def _validate_manual_travel(
    *,
    travel_date: date,
    from_address: str,
    to_address: str,
    total_km: float,
    patient_visited: bool,
    patient_name: str | None,
    transport_mode: str | None,
    bill_amount: float | None,
    has_invoice: bool,
) -> str:
    selected_mode = (transport_mode or "vehicle").strip().lower()
    if travel_date > india_now().date():
        raise HTTPException(status_code=400, detail="Travel date cannot be in the future")
    if not from_address.strip() or not to_address.strip():
        raise HTTPException(status_code=400, detail="From and to addresses are required")
    if total_km < 0:
        raise HTTPException(status_code=400, detail="Distance cannot be negative")
    if selected_mode not in ALLOWED_TRANSPORT_MODES:
        raise HTTPException(status_code=400, detail="Invalid transport mode selected")
    if patient_visited and not (patient_name or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Patient name is required when a patient was visited",
        )
    if selected_mode != "vehicle" and (
        bill_amount is None or bill_amount <= 0 or not has_invoice
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "A positive bill amount and invoice are required "
                "for non-vehicle transport"
            ),
        )
    return selected_mode


def _manual_actions(travel: TravelEntry, *, admin_view: bool) -> list[str]:
    if travel.schedule_id is not None or travel.status == "cancelled":
        return []
    if admin_view and travel.manual_review_status == "pending":
        return ["approve", "request_changes"]
    if (
        not admin_view
        and travel.claim_id is None
        and travel.status == "draft"
        and travel.manual_review_status in {"pending", "changes_requested"}
    ):
        return ["edit", "cancel"]
    return []


def _travel_response(
    travel: TravelEntry,
    *,
    admin_view: bool = False,
    therapist_name: str | None = None,
) -> TravelResponse:
    response = TravelResponse.model_validate(travel)
    return response.model_copy(
        update={
            "available_actions": _manual_actions(travel, admin_view=admin_view),
            "therapist_name": therapist_name,
        }
    )


def _add_manual_event(
    db: Session,
    *,
    travel: TravelEntry,
    actor_id: int,
    event_type: str,
    from_status: str | None,
    to_status: str,
    reason: str,
) -> None:
    db.add(
        ManualTravelReviewEvent(
            travel_id=travel.id,
            event_type=event_type,
            actor_id=actor_id,
            from_status=from_status,
            to_status=to_status,
            reason=reason.strip(),
            revision=travel.manual_revision,
        )
    )
    record_domain_audit_event(
        db,
        actor_id=actor_id,
        domain="financial",
        entity_type="manual_travel",
        entity_id=travel.id,
        action=event_type,
        from_state=from_status,
        to_state=to_status,
        reason=reason,
        details={"revision": travel.manual_revision},
    )

def resolve_invoice_path(invoice_file: str) -> Path:
    try:
        return resolve_stored_upload(invoice_file)
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=404,
            detail="Invoice file not found",
        ) from error

@router.post(
    "/",
    response_model=
    TravelResponse
)
def create_travel(

    patient_name:
    str | None = Form(None),

    travel_date:
    date = Form(...),

    from_address:
    str = Form(...),

    to_address:
    str = Form(...),

    total_km:
    float = Form(0),

    patient_visited:
    bool = Form(False),

    transport_mode:
    str = Form("vehicle"),

    bill_amount:
    float | None = Form(None),

    invoice_file:
    UploadFile | None =
    File(None),

    manual_reason:
    str = Form(..., min_length=10, max_length=500),

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):

    selected_transport_mode = _validate_manual_travel(
        travel_date=travel_date,
        from_address=from_address,
        to_address=to_address,
        total_km=total_km,
        patient_visited=patient_visited,
        patient_name=patient_name,
        transport_mode=transport_mode,
        bill_amount=bill_amount,
        has_invoice=invoice_file is not None,
    )

    policy = get_reimbursement_policy(db, travel_date)
    per_km_rate = money(policy.per_km_rate)
    rounded_distance = distance(total_km)
    travel_fare = money(0)

    if (
        selected_transport_mode
        ==
        "vehicle"
    ):

        travel_fare = money(rounded_distance * per_km_rate)

    elif bill_amount:

        travel_fare = money(bill_amount)

    file_path = None

    if invoice_file:
        try:
            file_path = str(store_validated_upload(invoice_file))
        except UploadValidationError as error:
            raise HTTPException(
                status_code=400,
                detail=str(error),
            ) from error

    travel = (
        TravelEntry(

            therapist_id=
            current_user.id,

            patient_name=
            patient_name,

            travel_date=
            travel_date,

            from_address=
            from_address,

            to_address=
            to_address,

            total_km=rounded_distance,

            per_km_rate=
            per_km_rate,

            travel_fare=
            travel_fare,
            policy_id=policy.id,
            calculation_version=CALCULATION_VERSION,
            rounding_mode=ROUNDING_MODE,

            patient_visited=
            patient_visited,

            transport_mode=
            selected_transport_mode,

            bill_amount=(
                None if bill_amount is None else money(decimal_value(bill_amount))
            ),

            invoice_file=
            file_path,
            manual_reason=manual_reason.strip(),
            manual_review_status="pending",
        )
    )

    db.add(travel
    )
    db.flush()
    _add_manual_event(
        db,
        travel=travel,
        actor_id=current_user.id,
        event_type="submitted_for_review",
        from_status=None,
        to_status="pending",
        reason=manual_reason,
    )
    db.commit()

    db.refresh(
        travel
    )

    return _travel_response(travel)

@router.put("/{travel_id}", response_model=TravelResponse)
def update_travel(
    travel_id: int,
    patient_name: str | None = Form(None),
    travel_date: date = Form(...),
    from_address: str = Form(...),
    to_address: str = Form(...),
    total_km: float = Form(0),
    patient_visited: bool = Form(False),
    transport_mode: str = Form("vehicle"),
    bill_amount: float | None = Form(None),
    invoice_file: UploadFile | None = File(None),
    manual_reason: str = Form(..., min_length=10, max_length=500),
    correction_reason: str = Form(..., min_length=5, max_length=500),
    version: int = Form(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.id == travel_id,
            TravelEntry.therapist_id == current_user.id,
        )
        .first()
    )
    if not travel:
        raise HTTPException(status_code=404, detail="Travel entry not found")

    if travel.schedule_id is not None:
        raise HTTPException(status_code=403, detail="Automatic travel cannot be edited")
    if travel.claim_id is not None or travel.status != "draft":
        raise HTTPException(status_code=409, detail="Claimed travel cannot be edited")
    if travel.manual_review_status not in {"pending", "changes_requested"}:
        raise HTTPException(status_code=409, detail="Approved travel cannot be edited")
    if travel.manual_review_version != version:
        raise HTTPException(
            status_code=409,
            detail="This travel entry changed after it was opened. Refresh and try again.",
        )

    selected_mode = _validate_manual_travel(
        travel_date=travel_date,
        from_address=from_address,
        to_address=to_address,
        total_km=total_km,
        patient_visited=patient_visited,
        patient_name=patient_name,
        transport_mode=transport_mode,
        bill_amount=bill_amount,
        has_invoice=(invoice_file is not None or bool(travel.invoice_file)),
    )
    policy = get_reimbursement_policy(db, travel_date)
    rounded_distance = distance(total_km)
    per_km_rate = money(policy.per_km_rate)
    fare = (
        money(rounded_distance * per_km_rate)
        if selected_mode == "vehicle"
        else money(decimal_value(bill_amount))
    )
    file_path = travel.invoice_file
    if invoice_file is not None:
        try:
            file_path = str(store_validated_upload(invoice_file))
        except UploadValidationError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    previous_status = travel.manual_review_status
    travel.patient_name = (patient_name or "").strip() or None
    travel.travel_date = travel_date
    travel.from_address = from_address.strip()
    travel.to_address = to_address.strip()
    travel.total_km = rounded_distance
    travel.per_km_rate = per_km_rate
    travel.travel_fare = fare
    travel.policy_id = policy.id
    travel.calculation_version = CALCULATION_VERSION
    travel.rounding_mode = ROUNDING_MODE
    travel.patient_visited = patient_visited
    travel.transport_mode = selected_mode
    travel.bill_amount = (
        None
        if selected_mode == "vehicle"
        else money(decimal_value(bill_amount))
    )
    travel.invoice_file = None if selected_mode == "vehicle" else file_path
    travel.manual_reason = manual_reason.strip()
    travel.manual_review_status = "pending"
    travel.manual_reviewed_by = None
    travel.manual_review_reason = None
    travel.manual_reviewed_at = None
    travel.manual_revision += 1
    travel.manual_review_version += 1
    travel.updated_at = datetime.now(timezone.utc)
    db.flush()
    _add_manual_event(
        db,
        travel=travel,
        actor_id=current_user.id,
        event_type="corrected_and_resubmitted",
        from_status=previous_status,
        to_status="pending",
        reason=correction_reason,
    )
    db.commit()
    db.refresh(travel)
    return _travel_response(travel)

@router.get(
    "/my",
    response_model=
    list[
        TravelResponse
    ]
)
def get_my_travel(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):
    return (
        db.query(
            TravelEntry
        )
        .filter(
            TravelEntry
            .therapist_id
            ==
            current_user.id,
            TravelEntry.status != "cancelled",
        )
        .all()
    )


@router.get(
    "/all",
    response_model=
    list[
        TravelResponse
    ]
)
def get_all_travel(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    return (
        db.query(
            TravelEntry
        )
        .all()
    )

@router.delete("/{travel_id}")
def delete_travel(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.id == travel_id,
            TravelEntry.therapist_id == current_user.id,
        )
        .first()
    )
    if not travel:
        raise HTTPException(status_code=404, detail="Travel entry not found")

    if travel.schedule_id is not None:
        raise HTTPException(status_code=403, detail="Automatic travel cannot be cancelled")
    if travel.claim_id is not None or travel.status != "draft":
        raise HTTPException(status_code=409, detail="Claimed travel cannot be cancelled")
    previous_status = travel.manual_review_status
    travel.status = "cancelled"
    travel.manual_review_status = "cancelled"
    travel.manual_review_version += 1
    travel.updated_at = datetime.now(timezone.utc)
    db.flush()
    _add_manual_event(
        db,
        travel=travel,
        actor_id=current_user.id,
        event_type="cancelled",
        from_status=previous_status,
        to_status="cancelled",
        reason="Cancelled by therapist before claim submission",
    )
    db.commit()
    return {"message": "Manual travel entry cancelled"}


# when I try to get today's travel entries, I am not getting any entries, even if I have created travel entries for today. I will check the date comparison logic in the query, and make sure that I am comparing only the date part of the datetime field in the database with today's date. I will use the date() function to extract the date part from the datetime field in the query.
@router.get("/today", response_model=list[TravelResponse])
def get_today_travel(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    today = india_now().date()
    travels = db.query(TravelEntry).filter(
        TravelEntry.therapist_id == current_user.id,
        func.date(TravelEntry.travel_date) == today,
        TravelEntry.status != "cancelled",

    ).all()
    return travels


@router.get("/manual-review", response_model=list[TravelResponse])
def list_manual_travel_for_review(
    status: str = Query(default="pending"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    del current_user
    normalized_status = status.strip().lower()
    if normalized_status != "all" and normalized_status not in MANUAL_REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid manual travel review status")
    query = db.query(TravelEntry).filter(TravelEntry.schedule_id.is_(None))
    if normalized_status != "all":
        query = query.filter(TravelEntry.manual_review_status == normalized_status)
    travels = query.order_by(TravelEntry.created_at.desc()).all()
    therapist_ids = {item.therapist_id for item in travels}
    therapist_names = {
        user.id: user.username
        for user in db.query(User).filter(User.id.in_(therapist_ids)).all()
    } if therapist_ids else {}
    return [
        _travel_response(
            item,
            admin_view=True,
            therapist_name=therapist_names.get(item.therapist_id),
        )
        for item in travels
    ]


@router.put(
    "/manual-review/{travel_id}/decision",
    response_model=TravelResponse,
)
def decide_manual_travel(
    travel_id: int,
    payload: ManualTravelDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    travel = (
        db.query(TravelEntry)
        .filter(TravelEntry.id == travel_id)
        .with_for_update()
        .first()
    )
    if travel is None or travel.schedule_id is not None:
        raise HTTPException(status_code=404, detail="Manual travel entry not found")
    if travel.claim_id is not None or travel.status != "draft":
        raise HTTPException(status_code=409, detail="Claimed travel cannot be reviewed")
    if travel.manual_review_version != payload.version:
        raise HTTPException(
            status_code=409,
            detail="This travel entry changed after it was opened. Refresh and review again.",
        )
    if travel.manual_review_status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"This travel entry is already {travel.manual_review_status}",
        )
    previous_status = travel.manual_review_status
    travel.manual_review_status = payload.decision
    travel.manual_reviewed_by = current_user.id
    travel.manual_review_reason = payload.reason.strip()
    travel.manual_reviewed_at = datetime.now(timezone.utc)
    travel.manual_review_version += 1
    travel.updated_at = datetime.now(timezone.utc)
    db.flush()
    _add_manual_event(
        db,
        travel=travel,
        actor_id=current_user.id,
        event_type=(
            "approved" if payload.decision == "approved" else "changes_requested"
        ),
        from_status=previous_status,
        to_status=payload.decision,
        reason=payload.reason,
    )
    db.commit()
    db.refresh(travel)
    therapist = db.query(User).filter(User.id == travel.therapist_id).first()
    return _travel_response(
        travel,
        admin_view=True,
        therapist_name=therapist.username if therapist else None,
    )


@router.get(
    "/{travel_id}/review-history",
    response_model=list[ManualTravelReviewEventResponse],
)
def get_manual_travel_review_history(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    travel = db.query(TravelEntry).filter(TravelEntry.id == travel_id).first()
    if travel is None or travel.schedule_id is not None:
        raise HTTPException(status_code=404, detail="Manual travel entry not found")
    if current_user.role != "admin" and travel.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    events = (
        db.query(ManualTravelReviewEvent)
        .filter(ManualTravelReviewEvent.travel_id == travel_id)
        .order_by(ManualTravelReviewEvent.id.asc())
        .all()
    )
    actor_ids = {event.actor_id for event in events}
    actors = {
        user.id: user.username
        for user in db.query(User).filter(User.id.in_(actor_ids)).all()
    } if actor_ids else {}
    return [
        ManualTravelReviewEventResponse(
            id=event.id,
            event_type=event.event_type,
            actor_id=event.actor_id,
            actor_name=actors.get(event.actor_id),
            from_status=event.from_status,
            to_status=event.to_status,
            reason=event.reason,
            revision=event.revision,
            created_at=event.created_at,
        )
        for event in events
    ]


@router.get("/{travel_id}/invoice")
def get_travel_invoice(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    travel = (
        db.query(TravelEntry)
        .filter(TravelEntry.id == travel_id)
        .first()
    )

    if not travel:
        raise HTTPException(status_code=404, detail="Travel not found")

    owns_invoice = (
        current_user.role == "therapist"
        and travel.therapist_id == current_user.id
    )
    if current_user.role != "admin" and not owns_invoice:
        raise HTTPException(status_code=403, detail="Not authorized")

    if not travel.invoice_file:
        raise HTTPException(
            status_code=404,
            detail="No invoice is attached to this travel entry",
        )

    invoice_path = resolve_invoice_path(travel.invoice_file)
    media_type = (
        mimetypes.guess_type(invoice_path.name)[0]
        or "application/octet-stream"
    )

    return FileResponse(
        path=invoice_path,
        media_type=media_type,
        filename=f"travel-{travel.id}-invoice{invoice_path.suffix}",
    )

@router.get(
    "/{travel_id}",
    response_model=
    TravelResponse
)
def get_travel_by_id(
    travel_id: int,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        get_current_user
    )
):
    travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.id
            ==
            travel_id
        )
        .first()
    )

    if not travel:
        raise HTTPException(
            status_code=404,
            detail=
            "Travel not found"
        )

    if (
        travel.therapist_id
        !=
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=
            "Not authorized"
        )

    return _travel_response(travel)
