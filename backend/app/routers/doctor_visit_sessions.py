from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.user import User
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
from app.services.schedule_location_service import validate_patient_arrival
from app.utils.auth import require_role
from app.utils.timezone import india_now


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

    if visit.visit_date != today:
        eligibility_message = "Punch In is available only on the visit date."
    elif visit.status != "scheduled":
        eligibility_message = (
            "This visit is no longer available for a treatment session."
        )
    elif visit.session_status == "IN_PROGRESS":
        eligibility_message = "Visit is in progress."
    elif visit.session_status == "COMPLETED":
        eligibility_message = "Visit session is complete."
    elif not workday_started:
        eligibility_message = "Start your workday before punching in."
    elif latitude is None or longitude is None:
        eligibility_message = "Current location is required for Punch In."
    else:
        try:
            patient_latitude, patient_longitude = ensure_visit_coordinates(
                visit
            )
            validate_patient_arrival(
                arrival_latitude=latitude,
                arrival_longitude=longitude,
                patient_latitude=patient_latitude,
                patient_longitude=patient_longitude,
            )
            location_verified = True
            can_punch_in = True
            eligibility_message = "You are at the patient location."
            db.commit()
        except ValueError as error:
            db.rollback()
            location_verified = False
            eligibility_message = str(error)

    return _session_response(
        visit,
        workday_started=workday_started,
        location_verified=location_verified,
        can_punch_in=can_punch_in,
        can_punch_out=can_punch_out,
        eligibility_message=eligibility_message,
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
    workday = get_doctor_workday(
        db,
        doctor.id,
        today,
        active_only=True,
    )
    if workday is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start your workday before punching in.",
        )
    if visit.visit_date != today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Punch In is available only on the visit date.",
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Punch out from the active visit before starting another.",
        )

    try:
        patient_latitude, patient_longitude = ensure_visit_coordinates(visit)
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=patient_latitude,
            patient_longitude=patient_longitude,
        )
    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    punched_in_at = datetime.now(timezone.utc)
    visit.punch_in_time = punched_in_at
    visit.punch_in_latitude = payload.latitude
    visit.punch_in_longitude = payload.longitude
    visit.session_status = "IN_PROGRESS"
    append_doctor_waypoint(
        db,
        doctor_id=doctor.id,
        workday_id=workday.id,
        waypoint_type="VISIT",
        latitude=patient_latitude,
        longitude=patient_longitude,
        address=visit.patient_address,
        recorded_at=punched_in_at,
        visit_id=visit.id,
    )
    db.commit()
    db.refresh(visit)
    return _session_response(
        visit,
        workday_started=True,
        location_verified=True,
        can_punch_in=False,
        can_punch_out=True,
        eligibility_message="Visit is in progress.",
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
    workday = get_doctor_workday(
        db,
        doctor.id,
        today,
        active_only=True,
    )
    if workday is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An active workday is required to punch out.",
        )
    if (
        visit.visit_date != today
        or visit.status != "scheduled"
        or visit.session_status != "IN_PROGRESS"
        or visit.punch_in_time is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Punch In is required before Punch Out.",
        )
    if visit.punch_out_time is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This visit has already been punched out.",
        )

    try:
        patient_latitude, patient_longitude = ensure_visit_coordinates(visit)
        validate_patient_arrival(
            arrival_latitude=payload.latitude,
            arrival_longitude=payload.longitude,
            patient_latitude=patient_latitude,
            patient_longitude=patient_longitude,
        )
    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

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
    db.commit()
    db.refresh(visit)
    return _session_response(
        visit,
        workday_started=True,
        location_verified=True,
        can_punch_in=False,
        can_punch_out=False,
        eligibility_message="Visit completed.",
    )
