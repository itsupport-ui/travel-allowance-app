from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import (
    WORKDAY_AUTO_LOGOUT_ENABLED,
    WORKDAY_AUTO_LOGOUT_GRACE_MINUTES,
    WORKDAY_END_TIME,
)
from app.database import get_db
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.user import User
from app.schemas.doctor_workday import (
    DoctorEndDayRequest,
    DoctorEndDayResponse,
    DoctorStartDayRequest,
    DoctorStartDayResponse,
    DoctorTodayWorkdayResponse,
    DoctorTravelWaypointResponse,
)
from app.services.doctor_attendance_service import (
    append_doctor_waypoint,
    get_current_doctor,
    get_doctor_workday,
    total_workday_distance,
)
from app.services.maps_service import reverse_geocode_address
from app.services.schedule_location_service import has_valid_coordinates
from app.utils.auth import require_role
from app.utils.timezone import india_now


router = APIRouter(
    prefix="/doctor/workday",
    tags=["Doctor Workday"],
)


def _policy(now: datetime) -> dict[str, object]:
    reached_end_time = now.time().replace(tzinfo=None) >= WORKDAY_END_TIME
    return {
        "workday_end_time": WORKDAY_END_TIME.strftime("%H:%M"),
        "can_end_workday": reached_end_time,
        "should_prompt_end": reached_end_time,
        "auto_logout_enabled": WORKDAY_AUTO_LOGOUT_ENABLED,
        "auto_logout_grace_minutes": WORKDAY_AUTO_LOGOUT_GRACE_MINUTES,
    }


@router.get(
    "/today",
    response_model=DoctorTodayWorkdayResponse,
)
def get_today_doctor_workday(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    now = india_now()
    doctor = get_current_doctor(db, current_user)
    workday = get_doctor_workday(db, doctor.id, now.date())
    policy = _policy(now)

    if workday is None:
        return DoctorTodayWorkdayResponse(
            started=False,
            work_date=now.date(),
            is_active=False,
            **policy,
        )

    return DoctorTodayWorkdayResponse(
        started=True,
        workday_id=workday.id,
        work_date=workday.work_date,
        started_at=workday.started_at,
        start_address=workday.start_address,
        start_latitude=workday.start_latitude,
        start_longitude=workday.start_longitude,
        is_active=workday.is_active,
        ended_at=workday.ended_at,
        total_work_minutes=workday.total_work_minutes,
        total_visits_count=workday.total_visits_count,
        completed_visits_count=workday.completed_visits_count,
        pending_visits_count=workday.pending_visits_count,
        total_distance_km=workday.total_distance_km,
        **{
            **policy,
            "can_end_workday": (
                workday.is_active and bool(policy["can_end_workday"])
            ),
            "should_prompt_end": (
                workday.is_active and bool(policy["should_prompt_end"])
            ),
        },
    )


@router.post(
    "/start",
    response_model=DoctorStartDayResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_doctor_workday(
    payload: DoctorStartDayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    now = india_now()
    doctor = get_current_doctor(db, current_user)
    if not has_valid_coordinates(
        payload.start_latitude,
        payload.start_longitude,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The captured current location is invalid.",
        )
    if get_doctor_workday(db, doctor.id, now.date()) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workday has already been started for today.",
        )

    started_at = datetime.now(timezone.utc)
    workday = DoctorWorkDay(
        doctor_id=doctor.id,
        work_date=now.date(),
        start_address=payload.start_address.strip(),
        start_latitude=payload.start_latitude,
        start_longitude=payload.start_longitude,
        started_at=started_at,
        is_active=True,
    )
    db.add(workday)
    db.flush()
    append_doctor_waypoint(
        db,
        doctor_id=doctor.id,
        workday_id=workday.id,
        waypoint_type="START",
        latitude=payload.start_latitude,
        longitude=payload.start_longitude,
        address=payload.start_address.strip(),
        recorded_at=started_at,
    )
    db.commit()
    return DoctorStartDayResponse(
        message="Doctor workday started successfully.",
        workday_id=workday.id,
    )


@router.post(
    "/end",
    response_model=DoctorEndDayResponse,
)
def end_doctor_workday(
    payload: DoctorEndDayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    now = india_now()
    if now.time().replace(tzinfo=None) < WORKDAY_END_TIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The workday can be ended at or after "
                f"{WORKDAY_END_TIME.strftime('%H:%M')}."
            ),
        )
    if not has_valid_coordinates(
        payload.end_latitude,
        payload.end_longitude,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The captured current location is invalid.",
        )

    doctor = get_current_doctor(db, current_user)
    workday = (
        db.query(DoctorWorkDay)
        .filter(
            DoctorWorkDay.doctor_id == doctor.id,
            DoctorWorkDay.work_date == now.date(),
            DoctorWorkDay.is_active.is_(True),
        )
        .with_for_update()
        .first()
    )
    if workday is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active workday was found for today.",
        )
    active_visit = (
        db.query(DoctorVisit.id)
        .filter(
            DoctorVisit.doctor_id == doctor.id,
            DoctorVisit.visit_date == now.date(),
            DoctorVisit.status == "scheduled",
            DoctorVisit.session_status == "IN_PROGRESS",
        )
        .first()
    )
    if active_visit is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Punch out from the active visit before ending the workday.",
        )

    visits = db.query(DoctorVisit).filter(
        DoctorVisit.doctor_id == doctor.id,
        DoctorVisit.visit_date == now.date(),
    )
    total_visits = visits.count()
    completed_visits = visits.filter(
        DoctorVisit.status.in_(["visited", "treatment_plan_submitted"])
    ).count()
    pending_visits = visits.filter(
        DoctorVisit.status == "scheduled"
    ).count()
    ended_at = datetime.now(timezone.utc)
    end_address = payload.end_address
    if not end_address:
        end_address = reverse_geocode_address(
            payload.end_latitude,
            payload.end_longitude,
        )

    append_doctor_waypoint(
        db,
        doctor_id=doctor.id,
        workday_id=workday.id,
        waypoint_type="END",
        latitude=payload.end_latitude,
        longitude=payload.end_longitude,
        address=end_address,
        recorded_at=ended_at,
    )
    workday.ended_at = ended_at
    workday.end_address = end_address
    workday.end_latitude = payload.end_latitude
    workday.end_longitude = payload.end_longitude
    started_at = workday.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    workday.total_work_minutes = max(
        0,
        int((ended_at - started_at).total_seconds() // 60),
    )
    workday.total_visits_count = total_visits
    workday.completed_visits_count = completed_visits
    workday.pending_visits_count = pending_visits
    db.flush()
    workday.total_distance_km = total_workday_distance(db, workday.id)
    workday.is_active = False
    db.commit()
    db.refresh(workday)

    return DoctorEndDayResponse(
        message="Doctor workday ended successfully.",
        workday_id=workday.id,
        ended_at=workday.ended_at,
        total_work_minutes=workday.total_work_minutes or 0,
        total_visits_count=workday.total_visits_count or 0,
        completed_visits_count=workday.completed_visits_count or 0,
        pending_visits_count=workday.pending_visits_count or 0,
        total_distance_km=workday.total_distance_km or 0,
    )


@router.get(
    "/route",
    response_model=list[DoctorTravelWaypointResponse],
)
def get_today_doctor_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    now = india_now()
    doctor = get_current_doctor(db, current_user)
    workday = get_doctor_workday(db, doctor.id, now.date())
    if workday is None:
        return []

    expenses = {
        expense.to_waypoint_id: expense.id
        for expense in db.query(DoctorExpense)
        .filter(
            DoctorExpense.doctor_id == doctor.id,
            DoctorExpense.workday_id == workday.id,
            DoctorExpense.to_waypoint_id.is_not(None),
        )
        .all()
    }
    waypoints = (
        db.query(DoctorTravelWaypoint)
        .filter(DoctorTravelWaypoint.workday_id == workday.id)
        .order_by(DoctorTravelWaypoint.sequence_number.asc())
        .all()
    )
    return [
        DoctorTravelWaypointResponse(
            id=waypoint.id,
            workday_id=waypoint.workday_id,
            visit_id=waypoint.visit_id,
            waypoint_type=waypoint.waypoint_type,
            sequence_number=waypoint.sequence_number,
            address=waypoint.address,
            latitude=waypoint.latitude,
            longitude=waypoint.longitude,
            recorded_at=waypoint.recorded_at,
            distance_from_previous_km=waypoint.distance_from_previous_km,
            expense_id=expenses.get(waypoint.id),
        )
        for waypoint in waypoints
    ]
