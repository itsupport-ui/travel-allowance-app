from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_visit import DoctorVisit
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.services.schedule_conflict_service import find_schedule_conflicts
from app.models.user import User
from app.schemas.treatment_plan import (
    TreatmentPlanCreate,
    TreatmentPlanRejectRequest,
    TreatmentPlanResponse,
    TreatmentPlanScheduleCreate,
)
from app.schemas.treatment_schedule import TreatmentScheduleResponse
from app.utils.auth import require_permission, require_role
from app.utils.workflow_transitions import (
    DOCTOR_VISIT_STATUS_TRANSITIONS,
    TREATMENT_PLAN_STATUS_TRANSITIONS,
    validate_status_transition,
)


router = APIRouter(
    prefix="/treatment-plans",
    tags=["Treatment Plans"],
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


def _treatment_plan_query(db: Session):
    return db.query(TreatmentPlan).options(
        selectinload(TreatmentPlan.treatment_schedules)
    )


# 1. Doctor submits Treatment Plan
# POST /treatment-plans/
# Business rules:

# Only doctors.

# One treatment plan per doctor visit.

# Doctor must own the visit.

# Visit status should be visited.

# After successful creation:

# Set visit status to treatment_plan_submitted.

@router.post("/", response_model=TreatmentPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_treatment_plan(
    treatment_plan: TreatmentPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    """
    Create a new treatment plan for a doctor visit.
    """
    doctor = _get_current_doctor(db, current_user)
    # Check if the doctor owns the visit
    visit = db.query(DoctorVisit).filter(DoctorVisit.id == treatment_plan.doctor_visit_id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor visit not found")
    if visit.doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create treatment plan for this visit")
    
    validate_status_transition(
        entity="Doctor visit status",
        current_status=visit.status,
        next_status="treatment_plan_submitted",
        transitions=DOCTOR_VISIT_STATUS_TRANSITIONS,
    )
    
    # Check if a treatment plan already exists for this visit
    existing_plan = db.query(TreatmentPlan).filter(TreatmentPlan.doctor_visit_id == treatment_plan.doctor_visit_id).first()
    if existing_plan:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A treatment plan already exists for this doctor visit")
    
    new_plan = TreatmentPlan(
        doctor_visit_id=treatment_plan.doctor_visit_id,
        doctor_id=doctor.id,
        patient_name=visit.patient_name,
        diagnosis=treatment_plan.diagnosis,
        chief_complaint=treatment_plan.chief_complaint,
        treatment_plan=treatment_plan.treatment_plan,
        medicines=treatment_plan.medicines,
        sessions_required=treatment_plan.sessions_required,
        frequency=treatment_plan.frequency,
        duration=treatment_plan.duration,
        special_instructions=treatment_plan.special_instructions,
        remarks=treatment_plan.remarks,
        status="submitted",
        created_at=datetime.utcnow(),
    )
    
    db.add(new_plan)

    # Update the visit status to 'treatment_plan_submitted'
    visit.status = "treatment_plan_submitted"

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A treatment plan already exists for this doctor visit",
        ) from error

    db.refresh(new_plan)

    return new_plan

# 2. Doctor views own plans
# GET /treatment-plans/my
@router.get("/my", response_model=List[TreatmentPlanResponse])
async def get_my_treatment_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    """
    Get all treatment plans created by the current doctor.
    """
    doctor = _get_current_doctor(db, current_user)
    plans = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.doctor_id == doctor.id)
        .all()
    )
    return plans

# 4. Admin views plans awaiting review
# GET /treatment-plans/pending
@router.get("/pending", response_model=List[TreatmentPlanResponse])
async def get_pending_treatment_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("treatment_plans.approve")
    ),
):
    """
    Get all treatment plans awaiting review.
    Only accessible by admins.
    """
    plans = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.status == "submitted")
        .all()
    )
    return plans

# GET /treatment-plans/approved
@router.get("/approved", response_model=list[TreatmentPlanResponse])
async def get_approved_treatment_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("treatment_plans.approve")
    ),
):
    """
    Get all approved treatment plans.
    Only accessible by admins.
    """
    plans = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.status == "approved")
        .all()
    )
    return plans


# 3. View single plan
# GET /treatment-plans/{plan_id}
# Doctors can view their own plans, and admins can view all.
@router.get("/{plan_id}", response_model=TreatmentPlanResponse)
async def get_treatment_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor", "admin"])),
):
    """
    Get a single treatment plan by ID.
    Doctors can view their own plans, and admins can view all.
    """
    doctor = (
        _get_current_doctor(db, current_user)
        if current_user.role == "doctor"
        else None
    )
    plan = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    if doctor is not None and plan.doctor_id != doctor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this treatment plan")
    return plan


# 5. Admin approves a plan
# PUT /treatment-plans/{plan_id}/approve
@router.put("/{plan_id}/approve", response_model=TreatmentPlanResponse)
async def approve_treatment_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("treatment_plans.approve")
    ),
):
    """
    Approve a treatment plan.
    Only accessible by admins.
    """
    plan = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    validate_status_transition(
        entity="Treatment plan status",
        current_status=plan.status,
        next_status="approved",
        transitions=TREATMENT_PLAN_STATUS_TRANSITIONS,
    )
    plan.status = "approved"
    db.commit()
    db.refresh(plan)
    return plan

# 6. Admin rejects a plan
# PUT /treatment-plans/{plan_id}/reject
@router.put("/{plan_id}/reject", response_model=TreatmentPlanResponse)
async def reject_treatment_plan(
    plan_id: int,
    reject_data: TreatmentPlanRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("treatment_plans.approve")
    ),
):
    """
    Reject a treatment plan.
    Only accessible by admins.
    """
    plan = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    validate_status_transition(
        entity="Treatment plan status",
        current_status=plan.status,
        next_status="rejected",
        transitions=TREATMENT_PLAN_STATUS_TRANSITIONS,
    )
    plan.status = "rejected"
    plan.rejection_reason = reject_data.reason

    visit = db.query(DoctorVisit).filter(DoctorVisit.id == plan.doctor_visit_id).first()
    if visit:
        visit.status = "visited"  # Revert the visit status back to 'visited' since the plan was rejected

    db.commit()
    db.refresh(plan)
    return plan


# Create:
# POST /treatment-plans/{plan_id}/create-schedule

# Requirements:

# 1. Only admin can access.
# 2. Treatment plan status must be approved.
# 3. Use treatment plan details to prefill schedule fields.
# 4. Admin selects therapist, treatment dates, timings, priority and instructions.
# 5. Create TreatmentSchedule records.
# 6. Link schedule to treatment_plan_id if column exists; otherwise suggest required model change.
# 7. Prevent creating schedules from rejected/submitted plans.
# 8. Return created schedule response.
# 9. Use rollback on failure.

@router.post(
    "/{plan_id}/create-schedule",
    response_model=List[TreatmentScheduleResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_treatment_schedule(
    plan_id: int,
    schedule_data: TreatmentPlanScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission("schedules.create")
    ),
):
    try:
        plan = (
            db.query(TreatmentPlan)
            .filter(TreatmentPlan.id == plan_id)
            .with_for_update()
            .first()
        )
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Treatment plan not found",
            )

        if plan.status != "approved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only approved treatment plans can generate schedules",
            )

        existing_schedule = (
            db.query(TreatmentSchedule)
            .filter(TreatmentSchedule.treatment_plan_id == plan.id)
            .first()
        )
        if existing_schedule:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Schedules have already been generated for this treatment plan",
            )

        therapist = (
            db.query(User)
            .filter(
                User.id == schedule_data.therapist_id,
                User.role == "therapist",
            )
            .first()
        )
        if not therapist:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Therapist not found",
            )

        visit = (
            db.query(DoctorVisit)
            .filter(DoctorVisit.id == plan.doctor_visit_id)
            .first()
        )
        if not visit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Doctor visit for treatment plan not found",
            )
        if not visit.patient_address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient address is required to create schedules",
            )

        treatment_name = plan.treatment_plan or plan.diagnosis
        if not treatment_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Treatment details are required to create schedules",
            )

        first_session_date = (
            schedule_data.treatment_date or schedule_data.start_date
        )
        for index in range(schedule_data.number_of_sessions):
            session_date = first_session_date + timedelta(days=index)
            if find_schedule_conflicts(
                db,
                therapist_id=therapist.id,
                schedule_type="one_time",
                treatment_date=session_date,
                start_date=None,
                end_date=None,
                in_time=schedule_data.in_time,
                out_time=schedule_data.out_time,
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "The selected therapist has an overlapping "
                        f"appointment on {session_date.isoformat()}."
                    ),
                )
        schedules = [
            TreatmentSchedule(
                treatment_plan_id=plan.id,
                patient_name=plan.patient_name,
                doctor_id=plan.doctor_id,
                therapist_id=therapist.id,
                treatment_name=treatment_name,
                medicines=plan.medicines,
                patient_address=visit.patient_address,
                schedule_type="one_time",
                treatment_date=first_session_date + timedelta(days=index),
                in_time=schedule_data.in_time,
                out_time=schedule_data.out_time,
                priority=schedule_data.priority,
                instructions=schedule_data.instructions,
                status="scheduled",
            )
            for index in range(schedule_data.number_of_sessions)
        ]

        db.add_all(schedules)
        db.flush()
        for schedule in schedules:
            db.refresh(schedule)
        db.commit()

        return schedules
    except HTTPException:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create treatment schedules",
        ) from error


