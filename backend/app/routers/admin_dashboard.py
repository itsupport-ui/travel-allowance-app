from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import Claim
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.schemas.dashboard import AdminDashboardSummary
from app.utils.auth import require_role

router = APIRouter(
    prefix="/admin-dashboard",
    tags=["Admin Dashboard"],
)


@router.get("/summary", response_model=AdminDashboardSummary)
def get_admin_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    today = date.today()

    total_therapists = (
        db.query(User)
        .filter(User.role == "therapist")
        .count()
    )
    todays_schedules = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.status == "scheduled",
            or_(
                and_(
                    TreatmentSchedule.schedule_type == "one_time",
                    TreatmentSchedule.treatment_date == today,
                ),
                and_(
                    TreatmentSchedule.schedule_type == "recurring",
                    TreatmentSchedule.start_date <= today,
                    TreatmentSchedule.end_date >= today,
                ),
            ),
        )
        .count()
    )
    pending_claims = (
        db.query(Claim)
        .filter(Claim.status == "pending")
        .count()
    )
    approved_claims = (
        db.query(Claim)
        .filter(Claim.status == "approved")
        .count()
    )
    rejected_claims = (
        db.query(Claim)
        .filter(Claim.status == "rejected")
        .count()
    )
    completed_treatments = (
        db.query(TreatmentSchedule)
        .filter(TreatmentSchedule.status == "completed")
        .count()
    )
    todays_claims = (
        db.query(Claim)
        .filter(Claim.claim_date == today)
        .count()
    )

    return {
        "total_therapists": total_therapists,
        "todays_schedules": todays_schedules,
        "pending_claims": pending_claims,
        "approved_claims": approved_claims,
        "rejected_claims": rejected_claims,
        "completed_treatments": completed_treatments,
        "todays_claims": todays_claims,
    }
