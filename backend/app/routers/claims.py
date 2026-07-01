import logging

from datetime import date
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.claim import Claim
from app.models.user import User
from app.models.travel import TravelEntry
from app.models.settings import Settings
from app.schemas.claim import ClaimDetailsResponse, ClaimResponse
from app.utils.auth import get_current_user, require_role
from app.services.push_notification_service import notify_claim_status
from sqlalchemy import func


router = APIRouter(
    prefix="/claims",
    tags=["Claims"]
)

logger = logging.getLogger(__name__)

# I have travel entries with patient visited today, and I want to submit a claim for today. I want to check if there is already a claim for today, if there is, I want to return an error message. If there is no claim for today, I want to calculate the total km, travel fare, daily allowance, and grand total for the claim, and then create a new claim in the database., but  I am getting no travel entries found for today error message, even though I have travel entries for today. I want to check if the travel entries are being created with the correct date, and if the claim submission is checking for the correct date as well. I also want to check if the patient visited today field is being set correctly in the travel entries, and if the daily allowance is being calculated correctly based on that field.
@router.post("/submit", response_model=ClaimResponse)
def submit_claim(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    today = date.today()
    
    # Check for duplicate claim for the same date
    existing_claim = (
        db.query(Claim)
        .filter(Claim.therapist_id == current_user.id, Claim.claim_date == today)
        .first()
    )

    if existing_claim:
        raise HTTPException(status_code=400, detail="Claim for today already submitted")

    # Get today's travel entries for the therapist
    travels = (
        db.query(TravelEntry)
        .filter(TravelEntry.therapist_id == current_user.id, func.date(TravelEntry.travel_date) == today)
        .all()
    )

    if not travels:
        raise HTTPException(status_code=400, detail="No travel entries found for today")

    total_km = round(sum(travel.total_km for travel in travels), 2)
    patient_visited_today = any(travel.patient_visited for travel in travels)
    settings = db.query(Settings).first()
    per_km_rate = settings.per_km_rate if settings else 3.0
    configured_allowance = settings.daily_allowance if settings else 150.0
    daily_allowance = (
        round(float(configured_allowance), 2)
        if patient_visited_today
        else 0.0
    )
    travel_total = round(
        sum(travel.travel_fare for travel in travels),
        2,
    )
    grand_total = round(travel_total + daily_allowance, 2)

    claim = Claim(
        therapist_id=current_user.id,
        claim_date=today,
        total_km=total_km,
        per_km_rate=per_km_rate,
        travel_total=travel_total,
        daily_allowance=daily_allowance,
        grand_total=grand_total,
        patient_visited_today=patient_visited_today,
        status="pending"
    )

    try:
        db.add(claim)
        db.flush()

        for travel in travels:
            travel.claim_id = claim.id

        db.commit()
    except Exception as error:
        db.rollback()
        logger.exception(
            "Unable to submit claim for therapist %s.",
            current_user.id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to submit today's claim.",
        ) from error

    return claim


@router.get("/pending", response_model=list[ClaimResponse])
def get_pending_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    claims = db.query(Claim).filter(Claim.status == "pending").all()
    result = []

    for claim in claims:
        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "travel_total": claim.travel_total,
            "daily_allowance": claim.daily_allowance,
            "grand_total": claim.grand_total,
            "status": claim.status,
            "therapist_name": claim.therapist.username,
            "per_km_rate": claim.per_km_rate,
            "patient_count": len(db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all()),
            "patient_visited_today": claim.patient_visited_today
        }
        result.append(claim_data)

    return result


@router.put("/{claim_id}/approve", response_model=ClaimResponse)
def approve_claim(
    claim_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending claims can be approved")

    claim.status = "approved"
    db.commit()
    db.refresh(claim)
    background_tasks.add_task(
        notify_claim_status,
        claim.therapist_id,
        claim.id,
        "approved",
    )
    return claim


@router.put("/{claim_id}/reject", response_model=ClaimResponse)
def reject_claim(
    claim_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending claims can be rejected")

    claim.status = "rejected"
    db.commit()
    db.refresh(claim)
    background_tasks.add_task(
        notify_claim_status,
        claim.therapist_id,
        claim.id,
        "rejected",
    )
    return claim


@router.get("/my", response_model=list[ClaimResponse])
def get_my_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    claims = (
        db.query(Claim)
        .filter(Claim.therapist_id == current_user.id)
        .order_by(Claim.claim_date.desc())
        .all()
    )

    result = []

    for claim in claims:

        patient_count = (
            db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).count()
        )
        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "per_km_rate": claim.per_km_rate,
            "travel_total": claim.travel_total,
            "daily_allowance": claim.daily_allowance,
            "grand_total": claim.grand_total,
            "status": claim.status,
            "therapist_name": claim.therapist.username,
            "patient_count": patient_count,
            "patient_visited_today": claim.patient_visited_today
        }
        result.append(claim_data)

    return result


@router.get("/all", response_model=list[ClaimResponse])
def get_all_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    claims = db.query(Claim).order_by(Claim.claim_date.desc()).all()

    result = []

    for claim in claims:
        # Calculate the number of travel entries for the current claim
        patient_count = (
            len(db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all())
        )

        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "per_km_rate": claim.per_km_rate,
            "travel_total": claim.travel_total,
            "daily_allowance": claim.daily_allowance,
            "grand_total": claim.grand_total,
            "patient_visited_today": claim.patient_visited_today,
            "status": claim.status,
            "therapist_name": claim.therapist.username,
            "patient_count": patient_count,  # Integrated into the response dictionary
        }
        result.append(claim_data)

    return result
    
@router.get("/{claim_id}/details", response_model=ClaimDetailsResponse)
def get_claim_details(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "therapist" and claim.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role not in {"admin", "therapist"}:
        raise HTTPException(status_code=403, detail="Access denied")

    travels = (db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all()
    )

    return {

        "claim": {

        "id": claim.id,
        "therapist_name": claim.therapist.username,
        "claim_date": claim.claim_date,
        "total_km": claim.total_km,
        "per_km_rate": claim.per_km_rate,
        "travel_total": claim.travel_total,
        "daily_allowance": claim.daily_allowance,
        "grand_total": claim.grand_total,
        "status": claim.status,
    },

    "travels": [
        {
            "id": travel.id,
            "travel_date": travel.travel_date,
            "patient_name": travel.patient_name,
            "transport_mode": travel.transport_mode,
            "bill_amount": travel.bill_amount,
            "invoice_file": travel.invoice_file,
            "from_address": travel.from_address,
            "to_address": travel.to_address,
            "total_km": travel.total_km,
            "per_km_rate": travel.per_km_rate,
            "travel_fare": travel.travel_fare,
            "patient_visited": travel.patient_visited,
            "status": travel.status,
        }
        for travel in travels
    ]
    }


@router.get(
    "/history",
    response_model=
    list[ClaimResponse]
)
def get_claim_history(

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(["admin"])
    )
):

    claims = (

        db.query(Claim)

        .filter(
            Claim.status
            !=
            "pending"
        )

        .order_by(
            Claim.claim_date.desc()
        )

        .all()
    )

    result = []

    for claim in claims:

        patient_count = (

            db.query(
                TravelEntry
            )

            .filter(
                TravelEntry.claim_id
                ==
                claim.id
            )

            .count()
        )

        claim_data = {

            "id":
            claim.id,

            "claim_date":
            claim.claim_date,

            "total_km":
            claim.total_km,

            "per_km_rate":
            claim.per_km_rate,

            "travel_total":
            claim.travel_total,

            "daily_allowance":
            claim.daily_allowance,

            "grand_total":
            claim.grand_total,

            "status":
            claim.status,

            "therapist_name":
            claim.therapist.username,

            "patient_count":
            patient_count
        }

        result.append(
            claim_data
        )

    return result



def create_auto_travel_claim(db, schedule, therapist):
    previous_schedule = (db.query(TreatmentSchedule)
        .filter(
            TreatmentSchedule.therapist_id == therapist.id,
            TreatmentSchedule.status == "completed",
            TreatmentSchedule.treatment_date == date.today(),
            TreatmentSchedule.id != schedule.id
        )
        .order_by(TreatmentSchedule.completed_at.desc())
        .first()
    )

    from_address = ( previous_schedule.patient_address if previous_schedule else therapist.base_location)
    to_address = schedule.patient_address
    claim = Claim(
        therapist_id=therapist.id,
        schedule_id=schedule.id,
        claim_date=date.today(),
        from_address=from_address,
        to_address=to_address,
        patient_visited_today=schedule.patient_name,
        total_km=0,
        travel_total=0,
        grand_total=0,
        auto_generated=True,
        source_type="auto",
        status="pending",
        remarks="Auto-generated from schedule"
    )

    db.add(claim)
    db.commit()
    db.refresh(claim)

    return claim
