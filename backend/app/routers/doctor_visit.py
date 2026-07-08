from datetime import date, datetime, time
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.doctor_visit import DoctorVisit
from app.models.user import User

from app.schemas.doctor_visit import (
    DoctorVisitStatusUpdate,
    DoctorVisitDashboardResponse,
    DoctorVisitResponse,
    DoctorVisitCreate,
    DoctorVisitUpdate,
)
from app.utils.auth import require_permission, require_role
from app.utils.workflow_transitions import (
    DOCTOR_VISIT_STATUS_TRANSITIONS,
    validate_status_transition,
)

from typing import List, Optional

router = APIRouter(
    prefix="/doctor-visits",
    tags=["Doctor Visits"]
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


@router.post("/", response_model=DoctorVisitResponse, status_code=status.HTTP_201_CREATED)
async def create_doctor_visit(
    visit: DoctorVisitCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(
        require_permission("doctor_visits.create")
    )):
    """
    Create a new doctor visit.
    """
    if visit.visit_date < date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot schedule a visit in the past")

    doctor = db.query(Doctor).filter(Doctor.id == visit.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    
    new_visit = DoctorVisit(
        patient_name=visit.patient_name,
        patient_phone=visit.patient_phone,
        patient_address=visit.patient_address,
        doctor_id=visit.doctor_id,
        visit_date=visit.visit_date,
        visit_time=visit.visit_time,
        chief_complaint=visit.chief_complaint,
        remarks=visit.remarks,
        created_by=current_user.id,
    )
    db.add(new_visit)
    db.commit()
    db.refresh(new_visit)
    return new_visit

@router.get("/my", response_model=list[DoctorVisitResponse])
async def get_my_doctor_visits(
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role(["doctor"]))):
    """
    Return all visits assigned to the logged-in doctor.
    """
    doctor = _get_current_doctor(db, current_user)
    visits = (
        db.query(DoctorVisit)
        .filter(DoctorVisit.doctor_id == doctor.id)
        .all()
    )
    return visits

@router.get("/dashboard", response_model=DoctorVisitDashboardResponse)
async def get_doctor_visits_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["doctor"])),
):
    today = date.today()
    doctor = _get_current_doctor(db, current_user)

    base_query = db.query(DoctorVisit).filter(
        DoctorVisit.doctor_id == doctor.id,
        DoctorVisit.visit_date == today,
    )

    return {
        "today_visits": base_query.count(),
        "scheduled": base_query.filter(DoctorVisit.status == "scheduled").count(),
        "visited": base_query.filter(DoctorVisit.status == "visited").count(),
        "treatment_plan_submitted": base_query.filter(
            DoctorVisit.status == "treatment_plan_submitted"
        ).count(),
        "cancelled": base_query.filter(DoctorVisit.status == "cancelled").count(),
    }
    
@router.get("/{visit_id}", response_model=DoctorVisitResponse)
async def get_doctor_visit(
    # Should allow admin also to view any visit
    
    visit_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role(["doctor", "admin"]))):
    """
    Get a specific doctor visit by ID.
    """
    visit = db.query(DoctorVisit).filter(DoctorVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor visit not found")
    if current_user.role == "doctor":
        doctor = _get_current_doctor(db, current_user)
        if visit.doctor_id != doctor.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this doctor visit")
    return visit

@router.put("/{visit_id}/status", response_model=DoctorVisitResponse)
async def update_doctor_visit_status(

    visit_id: int, 
    status_update: DoctorVisitStatusUpdate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role(["doctor", "admin"]))):
    """
    Update the status of a specific doctor visit.
    """
    visit = db.query(DoctorVisit).filter(DoctorVisit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor visit not found")
    if current_user.role == "doctor":
        doctor = _get_current_doctor(db, current_user)
        if visit.doctor_id != doctor.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this doctor visit")
    
    allowed_statuses = {
        *DOCTOR_VISIT_STATUS_TRANSITIONS.keys(),
        *{
            next_status
            for statuses in DOCTOR_VISIT_STATUS_TRANSITIONS.values()
            for next_status in statuses
        },
    }
    if status_update.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status value")

    validate_status_transition(
        entity="Doctor visit status",
        current_status=visit.status,
        next_status=status_update.status,
        transitions=DOCTOR_VISIT_STATUS_TRANSITIONS,
        allow_noop=True,
    )

    visit.status = status_update.status
    if status_update.remarks:
        visit.remarks = status_update.remarks
    if status_update.status == 'visited':
        visit.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(visit)
    return visit

