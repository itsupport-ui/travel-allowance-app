from datetime import datetime, timedelta, timezone
import math
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_visit import DoctorVisit
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.treatment_schedule_series import TreatmentScheduleSeries
from app.services.schedule_conflict_service import find_schedule_conflicts
from app.services.schedule_location_service import resolve_patient_coordinates
from app.services.domain_audit_service import record_domain_audit_event
from app.models.user import User
from app.schemas.treatment_plan import (
    TreatmentPlanCreate,
    TreatmentPlanRejectRequest,
    TreatmentPlanResubmit,
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


def _treatment_plan_response(
    plan: TreatmentPlan,
    *,
    actor_role: str,
) -> TreatmentPlanResponse:
    actions: list[str] = []
    blockers: list[str] = []
    next_action: str | None = None
    has_schedule = bool(plan.treatment_schedules)

    if actor_role == "doctor":
        if plan.status == "rejected":
            actions = ["correct_and_resubmit"]
            next_action = "correct_and_resubmit"
        elif plan.status == "submitted":
            actions = ["view_review_status"]
            blockers = ["AWAITING_ADMIN_REVIEW"]
            next_action = "wait_for_review"
        elif plan.status == "approved":
            actions = ["view_schedules"] if has_schedule else ["view_approval"]
            if not has_schedule:
                blockers = ["AWAITING_SCHEDULE_GENERATION"]
                next_action = "wait_for_schedule"
    elif actor_role == "admin":
        if plan.status == "submitted":
            actions = ["approve", "request_changes"]
            next_action = "review_plan"
        elif plan.status == "approved":
            actions = ["view_schedules"] if has_schedule else ["generate_schedule"]
            if not has_schedule:
                next_action = "generate_schedule"
        elif plan.status == "rejected":
            actions = ["view_correction_status"]
            blockers = ["AWAITING_DOCTOR_CORRECTION"]
            next_action = "wait_for_resubmission"

    return TreatmentPlanResponse.model_validate(plan).model_copy(
        update={
            "available_actions": actions,
            "blocking_reasons": blockers,
            "next_action": next_action,
        }
    )


def _default_cadence_days(frequency: str | None) -> int:
    normalized = (frequency or "").strip().lower()
    if "month" in normalized:
        return 30
    if "week" in normalized:
        match = re.search(
            r"(\d+)\s*(?:times|x)\s*(?:per\s*)?week",
            normalized,
        )
        if match:
            return max(1, math.ceil(7 / int(match.group(1))))
        return 7
    if "alternate" in normalized or "every other day" in normalized:
        return 2
    return 1


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
        db.flush()
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="clinical",
            entity_type="treatment_plan",
            entity_id=new_plan.id,
            action="submitted",
            from_state="draft",
            to_state="submitted",
            related_entity_type="doctor_visit",
            related_entity_id=visit.id,
            details={"revision": int(new_plan.revision or 1)},
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A treatment plan already exists for this doctor visit",
        ) from error

    db.refresh(new_plan)

    return _treatment_plan_response(new_plan, actor_role=current_user.role)

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
    return [_treatment_plan_response(plan, actor_role=current_user.role) for plan in plans]

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
    return [_treatment_plan_response(plan, actor_role=current_user.role) for plan in plans]

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
    return [_treatment_plan_response(plan, actor_role=current_user.role) for plan in plans]


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
    return _treatment_plan_response(plan, actor_role=current_user.role)


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
    prior_status = plan.status
    plan.status = "approved"
    plan.rejection_reason = None
    plan.reviewed_at = datetime.now(timezone.utc)
    plan.reviewed_by = current_user.id
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="treatment_plan",
        entity_id=plan.id,
        action="approved",
        from_state=prior_status,
        to_state="approved",
        related_entity_type="doctor_visit",
        related_entity_id=plan.doctor_visit_id,
        details={"revision": int(plan.revision or 1)},
    )
    db.commit()
    db.refresh(plan)
    return _treatment_plan_response(plan, actor_role=current_user.role)

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
    prior_status = plan.status
    plan.status = "rejected"
    plan.rejection_reason = reject_data.reason.strip()
    plan.reviewed_at = datetime.now(timezone.utc)
    plan.reviewed_by = current_user.id

    visit = db.query(DoctorVisit).filter(DoctorVisit.id == plan.doctor_visit_id).first()
    if visit:
        visit.status = "visited"  # Revert the visit status back to 'visited' since the plan was rejected

    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="treatment_plan",
        entity_id=plan.id,
        action="changes_requested",
        from_state=prior_status,
        to_state="rejected",
        reason_code="review_changes_requested",
        reason=reject_data.reason,
        related_entity_type="doctor_visit",
        related_entity_id=plan.doctor_visit_id,
        details={"revision": int(plan.revision or 1)},
    )

    db.commit()
    db.refresh(plan)
    return _treatment_plan_response(plan, actor_role=current_user.role)


@router.put(
    "/{plan_id}/resubmit",
    response_model=TreatmentPlanResponse,
)
async def resubmit_treatment_plan(
    plan_id: int,
    changes: TreatmentPlanResubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    """Correct and resubmit a rejected plan without creating a duplicate."""
    doctor = _get_current_doctor(db, current_user)
    plan = (
        _treatment_plan_query(db)
        .filter(TreatmentPlan.id == plan_id)
        .with_for_update()
        .first()
    )
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Treatment plan not found",
        )
    if plan.doctor_id != doctor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to resubmit this treatment plan",
        )

    validate_status_transition(
        entity="Treatment plan status",
        current_status=plan.status,
        next_status="submitted",
        transitions=TREATMENT_PLAN_STATUS_TRANSITIONS,
    )

    editable_fields = {
        "diagnosis",
        "chief_complaint",
        "treatment_plan",
        "medicines",
        "sessions_required",
        "frequency",
        "duration",
        "special_instructions",
        "remarks",
    }
    for field, value in changes.model_dump(exclude_unset=True).items():
        if field in editable_fields:
            setattr(plan, field, value)

    visit = (
        db.query(DoctorVisit)
        .filter(DoctorVisit.id == plan.doctor_visit_id)
        .with_for_update()
        .first()
    )
    if visit is None or visit.doctor_id != doctor.id:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The linked doctor visit is unavailable",
        )

    prior_status = plan.status
    plan.status = "submitted"
    plan.rejection_reason = None
    plan.reviewed_at = None
    plan.reviewed_by = None
    plan.revision = int(plan.revision or 1) + 1
    visit.status = "treatment_plan_submitted"
    record_domain_audit_event(
        db,
        actor_id=current_user.id,
        actor_role=current_user.role,
        domain="clinical",
        entity_type="treatment_plan",
        entity_id=plan.id,
        action="resubmitted",
        from_state=prior_status,
        to_state="submitted",
        related_entity_type="doctor_visit",
        related_entity_id=plan.doctor_visit_id,
        details={"revision": int(plan.revision or 1)},
    )
    db.commit()
    db.refresh(plan)
    return _treatment_plan_response(plan, actor_role=current_user.role)


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
                User.is_active.is_(True),
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

        try:
            patient_latitude, patient_longitude = resolve_patient_coordinates(
                visit.patient_address
            )
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

        treatment_name = plan.treatment_plan or plan.diagnosis
        if not treatment_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Treatment details are required to create schedules",
            )

        if (
            plan.sessions_required is not None
            and schedule_data.number_of_sessions != plan.sessions_required
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Number of sessions must match the approved treatment "
                    f"plan requirement ({plan.sessions_required})."
                ),
            )

        first_session_date = (
            schedule_data.treatment_date or schedule_data.start_date
        )
        cadence_days = (
            schedule_data.cadence_days
            or _default_cadence_days(plan.frequency)
        )
        for index in range(schedule_data.number_of_sessions):
            session_date = first_session_date + timedelta(
                days=index * cadence_days
            )
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
        last_session_date = first_session_date + timedelta(
            days=(schedule_data.number_of_sessions - 1) * cadence_days
        )
        series = TreatmentScheduleSeries(
            start_date=first_session_date,
            end_date=last_session_date,
            cadence_days=cadence_days,
            created_by=current_user.id,
        )
        db.add(series)
        db.flush()
        schedules = [
            TreatmentSchedule(
                treatment_plan_id=plan.id,
                patient_name=plan.patient_name,
                doctor_id=plan.doctor_id,
                therapist_id=therapist.id,
                treatment_name=treatment_name,
                medicines=plan.medicines,
                patient_address=visit.patient_address,
                patient_latitude=patient_latitude,
                patient_longitude=patient_longitude,
                schedule_type="one_time",
                treatment_date=first_session_date
                + timedelta(days=index * cadence_days),
                occurrence_date=first_session_date
                + timedelta(days=index * cadence_days),
                series_id=series.id,
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
        record_domain_audit_event(
            db,
            actor_id=current_user.id,
            actor_role=current_user.role,
            domain="scheduling",
            entity_type="treatment_schedule_series",
            entity_id=series.id,
            action="created",
            business_date=first_session_date,
            from_state="not_created",
            to_state="scheduled",
            related_entity_type="treatment_plan",
            related_entity_id=plan.id,
            details={
                "occurrence_count": len(schedules),
                "cadence_days": cadence_days,
            },
        )
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


