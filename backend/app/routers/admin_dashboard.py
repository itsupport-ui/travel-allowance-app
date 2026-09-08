from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_visit import DoctorVisit
from app.models.operational_follow_up import OperationalFollowUp
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.schemas.dashboard import AdminDashboardSummary
from app.utils.auth import require_permission
from app.utils.timezone import india_now

router = APIRouter(
    prefix="/admin-dashboard",
    tags=["Admin Dashboard"],
)


@router.get("/summary", response_model=AdminDashboardSummary)
def get_admin_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("dashboards.view")
    ),
):
    today = india_now().date()

    total_therapists = (
        db.query(User)
        .filter(User.role == "therapist", User.is_active.is_(True))
        .count()
    )
    total_doctors = (
        db.query(Doctor)
        .join(User, User.id == Doctor.user_id)
        .filter(Doctor.active.is_(True), User.is_active.is_(True))
        .count()
    )
    todays_therapist_schedules = (
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
    todays_doctor_visits = db.query(DoctorVisit).filter(
        DoctorVisit.status == "scheduled",
        DoctorVisit.visit_date == today,
    ).count()
    pending_claims = (
        db.query(Claim)
        .filter(Claim.status == "pending")
        .count()
        + db.query(DoctorClaim).filter(DoctorClaim.status == "pending").count()
    )
    approved_claims = (
        db.query(Claim)
        .filter(Claim.status == "approved")
        .count()
        + db.query(DoctorClaim).filter(DoctorClaim.status == "approved").count()
    )
    rejected_claims = (
        db.query(Claim)
        .filter(Claim.status == "rejected")
        .count()
        + db.query(DoctorClaim).filter(DoctorClaim.status == "rejected").count()
    )
    completed_therapist_treatments = (
        db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.status == "completed",
            func.date(TreatmentSchedule.completed_at) == today,
        )
        .count()
    )
    completed_doctor_visits = db.query(DoctorVisit).filter(
        DoctorVisit.status.in_({"visited", "treatment_plan_submitted"}),
        func.date(DoctorVisit.completed_at) == today,
    ).count()
    missed_clinical_activities = (
        db.query(TreatmentSchedule).filter(
            TreatmentSchedule.status == "missed",
            TreatmentSchedule.treatment_date == today,
        ).count()
    )
    todays_claims = (
        db.query(Claim)
        .filter(Claim.claim_date == today)
        .count()
        + db.query(DoctorClaim).filter(DoctorClaim.claim_date == today).count()
    )
    open_follow_ups = db.query(OperationalFollowUp).filter(
        OperationalFollowUp.status.in_({"open", "in_progress"})
    ).count()

    return {
        "total_therapists": total_therapists,
        "total_doctors": total_doctors,
        "total_clinical_staff": total_therapists + total_doctors,
        "todays_schedules": todays_therapist_schedules + todays_doctor_visits,
        "todays_therapist_schedules": todays_therapist_schedules,
        "todays_doctor_visits": todays_doctor_visits,
        "pending_claims": pending_claims,
        "approved_claims": approved_claims,
        "rejected_claims": rejected_claims,
        "completed_treatments": completed_therapist_treatments + completed_doctor_visits,
        "completed_therapist_treatments": completed_therapist_treatments,
        "completed_doctor_visits": completed_doctor_visits,
        "missed_clinical_activities": missed_clinical_activities,
        "todays_claims": todays_claims,
        "open_follow_ups": open_follow_ups,
    }
