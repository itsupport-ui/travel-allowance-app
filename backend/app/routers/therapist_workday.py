from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.therapist_workday import TherapistWorkDay
from app.schemas.therapist_workday import (
    StartDayRequest,
    StartDayResponse,
    TodayWorkdayResponse,
)
from app.utils.auth import require_role
from app.utils.timezone import india_now

router = APIRouter(
    prefix="/therapist/workday",
    tags=["Therapist Workday"]
)

@router.get("/today", response_model=TodayWorkdayResponse)
def get_today_workday(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"])),
):
    today = india_now().date()
    workday = (
        db.query(TherapistWorkDay)
        .filter(
            TherapistWorkDay.therapist_id == current_user.id,
            TherapistWorkDay.work_date == today,
            TherapistWorkDay.is_active.is_(True),
        )
        .order_by(TherapistWorkDay.id.desc())
        .first()
    )

    if workday is None:
        return TodayWorkdayResponse(
            started=False,
            work_date=today,
            is_active=False,
        )

    return TodayWorkdayResponse(
        started=True,
        workday_id=workday.id,
        work_date=workday.work_date,
        started_at=workday.started_at,
        start_address=workday.start_address,
        is_active=workday.is_active,
    )


@router.post("/start", response_model=StartDayResponse)
def start_day(
    payload: StartDayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    started_at = india_now()
    today = started_at.date()

    existing = (
        db.query(TherapistWorkDay)
        .filter(
            TherapistWorkDay.therapist_id == current_user.id,
            TherapistWorkDay.work_date == today,
            TherapistWorkDay.is_active.is_(True)
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Workday already started for today"
        )
    workday = TherapistWorkDay(
        therapist_id=current_user.id,
        work_date=today,
        start_address=payload.start_address,
        start_latitude=payload.start_latitude,
        start_longitude=payload.start_longitude,
        started_at=started_at,
        is_active=True
    )


    db.add(workday)
    db.commit()
    db.refresh(workday)

    return StartDayResponse(
        message="Workday started successfully",
        workday_id=workday.id,
    )
