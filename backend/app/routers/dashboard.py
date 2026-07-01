from datetime import (
    date
)

from fastapi import (
    APIRouter,
    Depends
)

from sqlalchemy.orm import (
    Session
)

from sqlalchemy import (
    func,
    or_,
    and_
)

from app.database import (
    get_db
)

from app.models.travel import (
    TravelEntry
)

from app.models.treatment_schedule import (
    TreatmentSchedule
)

from app.models.claim import (
    Claim
)

from app.models.user import (
    User
)

from app.schemas.dashboard import (
    DashboardSummary
)

from app.utils.auth import (
    get_current_user
)

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)


@router.get(
    "/summary",
    response_model=
    DashboardSummary
)
def get_dashboard_summary(

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        get_current_user
    )
):
    today = date.today()

    today_trips = (

        db.query(TravelEntry)

        .filter(
            TravelEntry.therapist_id
            ==
            current_user.id,

            func.date(TravelEntry.travel_date)
            ==
            today
        )

        .count()
    )

    today_km = (

        db.query(
            func.sum(
                TravelEntry.total_km
            )
        )

        .filter(
            TravelEntry.therapist_id
            ==
            current_user.id,

            func.date(TravelEntry.travel_date)
            ==
            today
        )

        .scalar()

        or 0
    )

    pending_claims = (

        db.query(Claim)

        .filter(
            Claim.therapist_id
            ==
            current_user.id,

            Claim.status
            ==
            "pending"
        )

        .count()
    )

    approved_claims = (

        db.query(Claim)

        .filter(
            Claim.therapist_id
            ==
            current_user.id,

            Claim.status
            ==
            "approved"
        )

        .count()
    )

    today_scheduled = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.status == "scheduled",
            or_(
                and_(
                    TreatmentSchedule.schedule_type == "one_time",
                    TreatmentSchedule.treatment_date == today
                ),
                and_(
                    TreatmentSchedule.schedule_type == "recurring",
                    TreatmentSchedule.start_date <= today,
                    TreatmentSchedule.end_date >= today
                )
            )
        )
        .count()
    )

    completed_today = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.status == "completed",
            func.date(TreatmentSchedule.completed_at) == today
        )
        .count()
    )

    missed_today = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.status == "missed"
        )
        .count()
    )

    upcoming = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == current_user.id,
            TreatmentSchedule.status == "scheduled",
            or_(
                and_(
                    TreatmentSchedule.schedule_type == "one_time",
                    TreatmentSchedule.treatment_date > today
                ),
                and_(
                    TreatmentSchedule.schedule_type == "recurring",
                    TreatmentSchedule.end_date > today
                )
            )
        )
        .count()
    )

    return {

        "today_trips":
        today_trips,

        "today_km":
        today_km,

        "pending_claims":
        pending_claims,

        "approved_claims":
        approved_claims,

        "today_scheduled":
        today_scheduled,

        "completed_today":
        completed_today,

        "missed_today":
        missed_today,

        "upcoming":
        upcoming
    }