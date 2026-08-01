from datetime import date
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.user import User
from app.schemas.doctor_expense import (
    DoctorExpenseCreate,
    DoctorExpenseResponse,
)
from app.utils.auth import require_role
from app.utils.uploads import (
    UploadValidationError,
    delete_stored_upload,
    store_validated_upload,
)
from app.services.doctor_attendance_service import (
    previous_waypoint,
    route_distance_km,
)
from app.services.maps_service import MapsServiceError


router = APIRouter(
    prefix="/doctor-expenses",
    tags=["Doctor Expenses"],
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
    fare: float = Form(..., gt=0),
    remarks: str | None = Form(None),
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
        fare=fare,
        remarks=remarks,
    )
    saved_proof_path = None

    try:
        route_values = {}
        if expense_data.visit_id is not None:
            today = date.today()
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
        elif not expense_data.from_location or not expense_data.to_location:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="From and to locations are required.",
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
            transport_mode=expense_data.transport_mode,
            fare=expense_data.fare,
            proof_file=(
                str(saved_proof_path)
                if saved_proof_path is not None
                else None
            ),
            remarks=expense_data.remarks,
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
        db.refresh(expense)
        db.commit()
        return expense
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

        if proof_file is not None:
            saved_proof_path = store_validated_upload(
                proof_file,
                subdirectory="doctor_expenses",
            )

            if expense.proof_file:
                previous_proof_path = Path(expense.proof_file)
            expense.proof_file = str(saved_proof_path)

        if expense_date is not None:
            expense.expense_date = expense_date
        if from_location is not None:
            expense.from_location = from_location
        if to_location is not None:
            expense.to_location = to_location
        if transport_mode is not None:
            expense.transport_mode = transport_mode
        if fare is not None:
            expense.fare = fare
        if remarks is not None:
            expense.remarks = remarks

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
    return expense


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
    "/today",
    response_model=list[DoctorExpenseResponse],
)
def get_today_doctor_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    return (
        db.query(DoctorExpense)
        .filter(
            DoctorExpense.doctor_id == doctor.id,
            DoctorExpense.expense_date == date.today(),
        )
        .order_by(DoctorExpense.created_at.desc())
        .all()
    )


@router.get(
    "/my",
    response_model=list[DoctorExpenseResponse],
)
def get_my_doctor_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    doctor = _get_current_doctor(db, current_user)
    return (
        db.query(DoctorExpense)
        .filter(DoctorExpense.doctor_id == doctor.id)
        .order_by(
            DoctorExpense.expense_date.desc(),
            DoctorExpense.created_at.desc(),
        )
        .all()
    )


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

    return expense
