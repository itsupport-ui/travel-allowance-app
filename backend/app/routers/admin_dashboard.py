from datetime import ( date )

from fastapi import ( APIRouter, Depends)

from sqlalchemy.orm import (
    Session
)

from app.database import (
    get_db
)

from app.models.claim import (
    Claim
)

from app.models.user import (
    User
)

from app.utils.auth import (
    get_current_user
)

router = APIRouter(
    prefix=
    "/admin-dashboard",

    tags=[
        "Admin Dashboard"
    ]
)


@router.get(
    "/summary"
)
def get_admin_summary(

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        get_current_user
    )
):

    today = date.today()

    pending_claims = (

        db.query(Claim)

        .filter(
            Claim.status
            ==
            "pending"
        )

        .count()
    )

    approved_claims = (

        db.query(Claim)

        .filter(
            Claim.status
            ==
            "approved"
        )

        .count()
    )

    total_therapists = (

        db.query(User)

        .filter(
            User.role
            ==
            "therapist"
        )

        .count()
    )

    todays_claims = (

        db.query(Claim)

        .filter(
            Claim.claim_date
            ==
            today
        )

        .count()
    )

    return {

        "pending_claims":
        pending_claims,

        "approved_claims":
        approved_claims,

        "total_therapists":
        total_therapists,

        "todays_claims":
        todays_claims
    }