from datetime import date, datetime, timezone
import mimetypes
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.manual_doctor_expense_review_event import (
    ManualDoctorExpenseReviewEvent,
)
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.user import User
from app.schemas.doctor_expense import (
    DoctorExpenseCreate,
    DoctorExpenseResponse,
    ManualDoctorExpenseDecision,
    ManualDoctorExpenseReviewEventResponse,
)
from app.utils.auth import get_current_user, require_permission, require_role
from app.utils.uploads import (
    UploadValidationError,
    delete_stored_upload,
    resolve_stored_upload,
    store_validated_upload,
)
from app.utils.timezone import india_now
from app.services.reimbursement_policy_service import (
    CALCULATION_VERSION,
    ROUNDING_MODE,
    distance,
    get_reimbursement_policy,
    doctor_receipt_is_required,
    money,
)
from app.services.doctor_attendance_service import (
    previous_waypoint,
    route_distance_km,
)
from app.services.domain_audit_service import record_domain_audit_event
from app.services.maps_service import MapsServiceError


router = APIRouter(
    prefix="/doctor-expenses",
    tags=["Doctor Expenses"],
)

EXPENSE_CATEGORIES = {
    "mileage",
    "public_transport",
    "toll_parking",
    "authorized_other",
}
MANUAL_REVIEW_STATUSES = {
    "pending",
    "approved",
    "changes_requested",
    "cancelled",
}
ALLOWED_TRANSPORT_MODES = {
    "auto",
    "bus",
    "cab",
    "car",
    "train",
    "other",
}


def _validate_category(value: str | None) -> str:
    category = (value or "public_transport").strip().lower()
    if category not in EXPENSE_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid expense category")
    return category


def _validate_transport_mode(value: str) -> str:
    mode = value.strip().lower()
    if mode not in ALLOWED_TRANSPORT_MODES:
        raise HTTPException(status_code=422, detail="Invalid transport mode")
    return mode


def _manual_actions(
    expense: DoctorExpense,
    *,
    admin_view: bool,
) -> list[str]:
    if expense.visit_id is not None or expense.status == "cancelled":
        return []
    if admin_view and expense.manual_review_status == "pending":
        return ["approve", "request_changes"]
    if (
        not admin_view
        and expense.claim_id is None
        and expense.status == "draft"
        and expense.manual_review_status in {"pending", "changes_requested"}
    ):
        return ["edit", "cancel"]
    return []


def _expense_response(
    expense: DoctorExpense,
    *,
    admin_view: bool = False,
    doctor_name: str | None = None,
) -> DoctorExpenseResponse:
    response = DoctorExpenseResponse.model_validate(expense)
    return response.model_copy(
        update={
            "available_actions": _manual_actions(
                expense,
                admin_view=admin_view,
            ),
            "doctor_name": doctor_name,
        }
    )


def _add_manual_event(
    db: Session,
    *,
    expense: DoctorExpense,
    actor_id: int,
    event_type: str,
    from_status: str | None,
    to_status: str,
    reason: str,
) -> None:
    db.add(
        ManualDoctorExpenseReviewEvent(
            expense_id=expense.id,
            event_type=event_type,
            actor_id=actor_id,
            from_status=from_status,
            to_status=to_status,
            reason=reason.strip(),
            revision=expense.manual_revision,
            submitted_amount=money(expense.fare),
            approved_amount=(
                money(expense.approved_amount)
                if expense.approved_amount is not None
                else None
            ),
        )
    )
    record_domain_audit_event(
        db,
        actor_id=actor_id,
        domain="financial",
        entity_type="manual_doctor_expense",
        entity_id=expense.id,
        action=event_type,
        from_state=from_status,
        to_state=to_status,
        reason=reason,
        details={
            "expense_category": expense.expense_category,
            "revision": expense.manual_revision,
            "submitted_amount": str(money(expense.fare)),
            "approved_amount": (
                str(money(expense.approved_amount))
                if expense.approved_amount is not None
                else None
            ),
        },
    )

def _get_current_doctor(db: Session, current_user: User) -> Doctor:
    doctor = (
        db.query(Doctor)
        .filter(Doctor.user_id == current_user.id)
        .first()
    )
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor profile is not linked to this user",
        )
    return doctor


def _remove_proof_file(proof_path: Path | None) -> None:
    delete_stored_upload(
        proof_path,
        subdirectory="doctor_expenses",
    )


def _get_editable_doctor_expense(
    db: Session,
    doctor_id: int,
    expense_id: int,
) -> DoctorExpense:
    expense = (
        db.query(DoctorExpense)
        .filter(
            DoctorExpense.id == expense_id,
            DoctorExpense.doctor_id == doctor_id,
        )
        .with_for_update()
        .first()
    )
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor expense not found",
        )
    if expense.claim_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expenses linked to a claim cannot be modified or deleted",
        )
    if expense.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft expenses can be modified or deleted",
        )

    return expense


@router.post(
    "/",
    response_model=DoctorExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_expense(
    expense_date: date = Form(...),
    from_location: str | None = Form(None),
    to_location: str | None = Form(None),
    visit_id: int | None = Form(None),
    transport_mode: str = Form(...),
    fare: float | None = Form(None, gt=0),
    remarks: str | None = Form(None),
    expense_category: str | None = Form(None),
    manual_reason: str | None = Form(None, max_length=500),
    proof_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    expense_data = DoctorExpenseCreate(
        expense_date=expense_date,
        from_location=from_location,
        to_location=to_location,
        visit_id=visit_id,
        transport_mode=transport_mode,
        fare=None if fare is None else money(fare),
        remarks=remarks,
        expense_category=expense_category,
        manual_reason=manual_reason,
    )
    saved_proof_path = None

    try:
        route_values = {}
        selected_category = _validate_category(
            expense_data.expense_category
        )
        selected_mode = _validate_transport_mode(
            expense_data.transport_mode
        )
        policy_id = None
        rate_applied = None
        receipt_threshold_applied = None
        receipt_required = False
        final_fare = money(expense_data.fare)
        if selected_category != "mileage" and expense_data.fare is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A positive actual fare is required for this category.",
            )
        if expense_data.visit_id is not None:
            today = india_now().date()
            visit = (
                db.query(DoctorVisit)
                .filter(
                    DoctorVisit.id == expense_data.visit_id,
                    DoctorVisit.doctor_id == doctor.id,
                    DoctorVisit.visit_date == today,
                    DoctorVisit.status.in_(
                        ["visited", "treatment_plan_submitted"]
                    ),
                    DoctorVisit.session_status == "COMPLETED",
                )
                .first()
            )
            if visit is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Select a completed patient visit from today."
                    ),
                )
            existing_expense = (
                db.query(DoctorExpense.id)
                .filter(DoctorExpense.visit_id == visit.id)
                .first()
            )
            if existing_expense is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An expense already exists for this visit.",
                )
            workday = (
                db.query(DoctorWorkDay)
                .filter(
                    DoctorWorkDay.doctor_id == doctor.id,
                    DoctorWorkDay.work_date == today,
                )
                .first()
            )
            if workday is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Start Work Day is required before expenses.",
                )
            destination = (
                db.query(DoctorTravelWaypoint)
                .filter(
                    DoctorTravelWaypoint.workday_id == workday.id,
                    DoctorTravelWaypoint.visit_id == visit.id,
                )
                .first()
            )
            if destination is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Travel route was not recorded for this visit.",
                )
            origin = previous_waypoint(db, destination)
            if origin is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Travel route origin is unavailable.",
                )
            try:
                distance_km = route_distance_km(origin, destination)
            except MapsServiceError as error:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(error),
                ) from error
            route_values = {
                "expense_date": today,
                "workday_id": workday.id,
                "visit_id": visit.id,
                "from_waypoint_id": origin.id,
                "to_waypoint_id": destination.id,
                "from_location": origin.address or "Starting location",
                "to_location": (
                    destination.address or visit.patient_address
                ),
                "from_latitude": origin.latitude,
                "from_longitude": origin.longitude,
                "to_latitude": destination.latitude,
                "to_longitude": destination.longitude,
                "distance_km": distance_km,
            }
            if selected_category == "mileage":
                if selected_mode != "car":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Mileage reimbursement requires car as the transport mode.",
                    )
                policy = get_reimbursement_policy(db, today)
                policy_id = policy.id
                rate_applied = money(policy.per_km_rate)
                final_fare = money(distance(distance_km) * rate_applied)
        elif not expense_data.from_location or not expense_data.to_location:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="From and to locations are required.",
            )
        else:
            reason = (expense_data.manual_reason or "").strip()
            if expense_data.expense_date > india_now().date():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Expense date cannot be in the future.",
                )
            if selected_category == "mileage":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Mileage requires a completed visit and verified route. "
                        "Choose another category for a manual exception."
                    ),
                )
            if len(reason) < 10:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A manual expense reason of at least 10 characters is required.",
                )
        policy_date = route_values.get("expense_date", expense_data.expense_date)
        policy = get_reimbursement_policy(db, policy_date)
        policy_id = policy.id
        receipt_threshold_applied = money(policy.doctor_receipt_threshold)
        receipt_required = doctor_receipt_is_required(
            amount=final_fare,
            threshold=receipt_threshold_applied,
            expense_category=selected_category,
            is_manual=expense_data.visit_id is None,
        )
        if receipt_required and proof_file is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "A receipt is required by the reimbursement policy for "
                    "this expense."
                ),
            )

        if proof_file is not None:
            saved_proof_path = store_validated_upload(
                proof_file,
                subdirectory="doctor_expenses",
            )

        expense = DoctorExpense(
            doctor_id=doctor.id,
            expense_date=route_values.get(
                "expense_date",
                expense_data.expense_date,
            ),
            from_location=route_values.get(
                "from_location",
                expense_data.from_location,
            ),
            to_location=route_values.get(
                "to_location",
                expense_data.to_location,
            ),
            transport_mode=selected_mode,
            fare=final_fare,
            proof_file=(
                str(saved_proof_path)
                if saved_proof_path is not None
                else None
            ),
            remarks=expense_data.remarks,
            expense_category=selected_category,
            manual_reason=(
                (expense_data.manual_reason or "").strip()
                if expense_data.visit_id is None
                else None
            ),
            manual_review_status=(
                "pending" if expense_data.visit_id is None else None
            ),
            policy_id=policy_id,
            rate_applied=rate_applied,
            receipt_threshold_applied=receipt_threshold_applied,
            receipt_required=receipt_required,
            calculation_version=CALCULATION_VERSION,
            rounding_mode=ROUNDING_MODE,
            status="draft",
            claim_id=None,
            **{
                key: value
                for key, value in route_values.items()
                if key
                not in {"expense_date", "from_location", "to_location"}
            },
        )

        db.add(expense)
        db.flush()
        if expense.visit_id is None:
            _add_manual_event(
                db,
                expense=expense,
                actor_id=current_user.id,
                event_type="submitted_for_review",
                from_status=None,
                to_status="pending",
                reason=expense.manual_reason or "Manual expense submitted",
            )
        db.refresh(expense)
        db.commit()
        return _expense_response(expense)
    except UploadValidationError as error:
        db.rollback()
        _remove_proof_file(saved_proof_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except HTTPException:
        db.rollback()
        _remove_proof_file(saved_proof_path)
        raise
    except Exception as error:
        db.rollback()
        _remove_proof_file(saved_proof_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create doctor expense",
        ) from error


@router.put(
    "/{expense_id}",
    response_model=DoctorExpenseResponse,
)
def update_doctor_expense(
    expense_id: int,
    expense_date: date | None = Form(None),
    from_location: str | None = Form(None),
    to_location: str | None = Form(None),
    transport_mode: str | None = Form(None),
    fare: float | None = Form(None, gt=0),
    remarks: str | None = Form(None),
    expense_category: str | None = Form(None),
    manual_reason: str | None = Form(None, max_length=500),
    correction_reason: str | None = Form(None, max_length=500),
    version: int | None = Form(None, ge=1),
    proof_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    saved_proof_path = None
    previous_proof_path = None

    try:
        doctor = _get_current_doctor(db, current_user)
        expense = _get_editable_doctor_expense(
            db,
            doctor.id,
            expense_id,
        )
        is_manual = expense.visit_id is None
        selected_category = _validate_category(
            expense_category or expense.expense_category
        )
        selected_mode = _validate_transport_mode(
            transport_mode or expense.transport_mode
        )

        if is_manual:
            if expense.manual_review_status not in {
                "pending",
                "changes_requested",
            }:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Approved manual expenses cannot be edited.",
                )
            if version is None or version != expense.manual_review_version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "This expense changed after it was opened. "
                        "Refresh and try again."
                    ),
                )
            normalized_reason = (manual_reason or expense.manual_reason or "").strip()
            correction = (correction_reason or "").strip()
            if len(normalized_reason) < 10:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A manual expense reason of at least 10 characters is required.",
                )
            if len(correction) < 5:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A correction reason of at least 5 characters is required.",
                )
            if selected_category == "mileage":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mileage requires a completed visit and verified route.",
                )
            next_date = expense_date or expense.expense_date
            if next_date > india_now().date():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Expense date cannot be in the future.",
                )
            next_from = (from_location or expense.from_location).strip()
            next_to = (to_location or expense.to_location).strip()
            if not next_from or not next_to:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="From and to locations are required.",
                )
        else:
            normalized_reason = ""
            correction = ""

        if proof_file is not None:
            saved_proof_path = store_validated_upload(
                proof_file,
                subdirectory="doctor_expenses",
            )

            if expense.proof_file:
                previous_proof_path = Path(expense.proof_file)
            expense.proof_file = str(saved_proof_path)

        if is_manual:
            expense.expense_date = expense_date or expense.expense_date
            expense.from_location = (from_location or expense.from_location).strip()
            expense.to_location = (to_location or expense.to_location).strip()
        expense.transport_mode = selected_mode
        expense.expense_category = selected_category
        if selected_category == "mileage":
            if selected_mode != "car":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mileage reimbursement requires car as the transport mode.",
                )
            if expense.distance_km is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Verified distance is unavailable for mileage.",
                )
            policy = get_reimbursement_policy(db, expense.expense_date)
            expense.policy_id = policy.id
            expense.rate_applied = money(policy.per_km_rate)
            expense.fare = money(
                distance(expense.distance_km) * expense.rate_applied
            )
        elif fare is not None:
            expense.fare = money(fare)
            expense.rate_applied = None
        policy = get_reimbursement_policy(db, expense.expense_date)
        expense.policy_id = policy.id
        expense.receipt_threshold_applied = money(
            policy.doctor_receipt_threshold
        )
        expense.receipt_required = doctor_receipt_is_required(
            amount=expense.fare,
            threshold=expense.receipt_threshold_applied,
            expense_category=selected_category,
            is_manual=is_manual,
        )
        if expense.receipt_required and not expense.proof_file:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "A receipt is required by the reimbursement policy for "
                    "this expense."
                ),
            )
        if remarks is not None:
            expense.remarks = remarks
        expense.calculation_version = CALCULATION_VERSION
        expense.rounding_mode = ROUNDING_MODE

        if is_manual:
            previous_status = expense.manual_review_status
            expense.manual_reason = normalized_reason
            expense.manual_review_status = "pending"
            expense.manual_reviewed_by = None
            expense.manual_review_reason = None
            expense.manual_reviewed_at = None
            expense.approved_amount = None
            expense.manual_revision += 1
            expense.manual_review_version += 1
            expense.updated_at = datetime.now(timezone.utc)
            db.flush()
            _add_manual_event(
                db,
                expense=expense,
                actor_id=current_user.id,
                event_type="corrected_and_resubmitted",
                from_status=previous_status,
                to_status="pending",
                reason=correction,
            )

        db.flush()
        db.refresh(expense)
        db.commit()
    except UploadValidationError as error:
        db.rollback()
        _remove_proof_file(saved_proof_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except HTTPException:
        db.rollback()
        _remove_proof_file(saved_proof_path)
        raise
    except Exception as error:
        db.rollback()
        _remove_proof_file(saved_proof_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update doctor expense",
        ) from error

    _remove_proof_file(previous_proof_path)
    return _expense_response(expense)


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_doctor_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    proof_path = None

    try:
        doctor = _get_current_doctor(db, current_user)
        expense = _get_editable_doctor_expense(
            db,
            doctor.id,
            expense_id,
        )
        if expense.proof_file:
            proof_path = Path(expense.proof_file)

        if expense.visit_id is None:
            previous_status = expense.manual_review_status
            expense.status = "cancelled"
            expense.manual_review_status = "cancelled"
            expense.manual_review_version += 1
            expense.updated_at = datetime.now(timezone.utc)
            _add_manual_event(
                db,
                expense=expense,
                actor_id=current_user.id,
                event_type="cancelled",
                from_status=previous_status,
                to_status="cancelled",
                reason="Cancelled by doctor before claim submission",
            )
            proof_path = None
        else:
            db.delete(expense)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete doctor expense",
        ) from error

    _remove_proof_file(proof_path)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/manual-review",
    response_model=list[DoctorExpenseResponse],
)
def list_manual_doctor_expenses_for_review(
    review_status: str = Query(default="pending", alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    del current_user
    normalized_status = review_status.strip().lower()
    if (
        normalized_status != "all"
        and normalized_status not in MANUAL_REVIEW_STATUSES
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid manual expense review status",
        )
    query = (
        db.query(DoctorExpense, Doctor.name)
        .join(Doctor, Doctor.id == DoctorExpense.doctor_id)
        .filter(DoctorExpense.visit_id.is_(None))
    )
    if normalized_status != "all":
        query = query.filter(
            DoctorExpense.manual_review_status == normalized_status
        )
    rows = query.order_by(DoctorExpense.created_at.desc()).all()
    return [
        _expense_response(
            expense,
            admin_view=True,
            doctor_name=doctor_name,
        )
        for expense, doctor_name in rows
    ]


@router.put(
    "/manual-review/{expense_id}/decision",
    response_model=DoctorExpenseResponse,
)
def decide_manual_doctor_expense(
    expense_id: int,
    payload: ManualDoctorExpenseDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboards.view")),
):
    expense = (
        db.query(DoctorExpense)
        .filter(DoctorExpense.id == expense_id)
        .with_for_update()
        .first()
    )
    if expense is None or expense.visit_id is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Manual doctor expense not found",
        )
    if expense.claim_id is not None or expense.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Claimed expenses cannot be reviewed",
        )
    if expense.manual_review_version != payload.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This expense changed after it was opened. "
                "Refresh and review again."
            ),
        )
    if expense.manual_review_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This expense is already "
                f"{expense.manual_review_status or 'not reviewable'}"
            ),
        )

    previous_status = expense.manual_review_status
    approved_amount = (
        money(payload.approved_amount)
        if payload.approved_amount is not None
        else money(expense.fare)
    )
    if payload.decision == "approved" and approved_amount > money(expense.fare):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Approved amount cannot exceed the submitted fare.",
        )
    if payload.decision == "changes_requested" and payload.approved_amount is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Approved amount is only allowed when approving an expense.",
        )
    expense.manual_review_status = payload.decision
    expense.approved_amount = (
        approved_amount if payload.decision == "approved" else None
    )
    expense.manual_reviewed_by = current_user.id
    expense.manual_review_reason = payload.reason.strip()
    expense.manual_reviewed_at = datetime.now(timezone.utc)
    expense.manual_review_version += 1
    expense.updated_at = datetime.now(timezone.utc)
    db.flush()
    _add_manual_event(
        db,
        expense=expense,
        actor_id=current_user.id,
        event_type=(
            "approved"
            if payload.decision == "approved"
            else "changes_requested"
        ),
        from_status=previous_status,
        to_status=payload.decision,
        reason=payload.reason,
    )
    db.commit()
    db.refresh(expense)
    doctor = db.query(Doctor).filter(Doctor.id == expense.doctor_id).first()
    return _expense_response(
        expense,
        admin_view=True,
        doctor_name=doctor.name if doctor else None,
    )


@router.get(
    "/{expense_id}/review-history",
    response_model=list[ManualDoctorExpenseReviewEventResponse],
)
def get_manual_doctor_expense_review_history(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (
        db.query(DoctorExpense)
        .filter(DoctorExpense.id == expense_id)
        .first()
    )
    if expense is None or expense.visit_id is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Manual doctor expense not found",
        )
    owns_expense = (
        db.query(Doctor.id)
        .filter(
            Doctor.id == expense.doctor_id,
            Doctor.user_id == current_user.id,
        )
        .first()
        is not None
    )
    if current_user.role != "admin" and not owns_expense:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )
    events = (
        db.query(ManualDoctorExpenseReviewEvent)
        .filter(ManualDoctorExpenseReviewEvent.expense_id == expense_id)
        .order_by(ManualDoctorExpenseReviewEvent.id.asc())
        .all()
    )
    actor_ids = {event.actor_id for event in events}
    actors = (
        {
            user.id: user.username
            for user in db.query(User).filter(User.id.in_(actor_ids)).all()
        }
        if actor_ids
        else {}
    )
    return [
        ManualDoctorExpenseReviewEventResponse(
            id=event.id,
            event_type=event.event_type,
            actor_id=event.actor_id,
            actor_name=actors.get(event.actor_id),
            from_status=event.from_status,
            to_status=event.to_status,
            reason=event.reason,
            revision=event.revision,
            submitted_amount=event.submitted_amount,
            approved_amount=event.approved_amount,
            created_at=event.created_at,
        )
        for event in events
    ]


@router.get("/{expense_id}/proof")
def download_doctor_expense_proof(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = (
        db.query(DoctorExpense)
        .filter(DoctorExpense.id == expense_id)
        .first()
    )
    if expense is None:
        raise HTTPException(status_code=404, detail="Doctor expense not found")
    owns_expense = (
        db.query(Doctor.id)
        .filter(
            Doctor.id == expense.doctor_id,
            Doctor.user_id == current_user.id,
        )
        .first()
        is not None
    )
    if current_user.role != "admin" and not owns_expense:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not expense.proof_file:
        raise HTTPException(status_code=404, detail="No receipt is attached")
    try:
        proof_path = resolve_stored_upload(
            expense.proof_file,
            subdirectory="doctor_expenses",
        )
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=404, detail="Receipt file not found") from error
    media_type = mimetypes.guess_type(proof_path.name)[0] or "application/octet-stream"
    return FileResponse(
        path=proof_path,
        media_type=media_type,
        filename=f"doctor-expense-{expense.id}-receipt{proof_path.suffix}",
    )


@router.get(
    "/today",
    response_model=list[DoctorExpenseResponse],
)
def get_today_doctor_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    expenses = (
        db.query(DoctorExpense)
        .filter(
            DoctorExpense.doctor_id == doctor.id,
            DoctorExpense.expense_date == india_now().date(),
            DoctorExpense.status != "cancelled",
        )
        .order_by(DoctorExpense.created_at.desc())
        .all()
    )
    return [_expense_response(expense) for expense in expenses]


@router.get(
    "/my",
    response_model=list[DoctorExpenseResponse],
)
def get_my_doctor_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    expenses = (
        db.query(DoctorExpense)
        .filter(
            DoctorExpense.doctor_id == doctor.id,
            DoctorExpense.status != "cancelled",
        )
        .order_by(
            DoctorExpense.expense_date.desc(),
            DoctorExpense.created_at.desc(),
        )
        .all()
    )
    return [_expense_response(expense) for expense in expenses]


@router.get(
    "/{expense_id}",
    response_model=DoctorExpenseResponse,
)
def get_doctor_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    expense = (
        db.query(DoctorExpense)
        .filter(
            DoctorExpense.id == expense_id,
            DoctorExpense.doctor_id == doctor.id,
        )
        .first()
    )
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor expense not found",
        )

    return _expense_response(expense)
