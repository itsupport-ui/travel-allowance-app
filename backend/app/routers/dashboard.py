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
    func
)

from app.database import (
    get_db
)

from app.models.travel import (
    TravelEntry
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

    return {

        "today_trips":
        today_trips,

        "today_km":
        today_km,

        "pending_claims":
        pending_claims,

        "approved_claims":
        approved_claims
    }