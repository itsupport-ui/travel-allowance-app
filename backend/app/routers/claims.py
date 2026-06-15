from pydantic import BaseModel
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.claim import Claim
from app.models.user import User
from app.models.travel import TravelEntry
from app.models.settings import Settings
from app.schemas.claim import ClaimResponse
from app.utils.auth import get_current_user, require_role
from sqlalchemy import func


router = APIRouter(
    prefix="/claims",
    tags=["Claims"]
)

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

    total_km = sum(travel.total_km for travel in travels)

    # Patient Visit check
    patient_visited_today = any(travel.patient_visited for travel in travels)

    settings = db.query(Settings).first()

    daily_allowance = settings.daily_allowance if patient_visited_today else 0

    travel_total = sum(travel.travel_fare for travel in travels)
    grand_total = travel_total + daily_allowance

    claim = Claim(
        therapist_id=current_user.id,
        claim_date=today,
        total_km=total_km,
        travel_total=travel_total,
        daily_allowance=daily_allowance,
        grand_total=grand_total,
        patient_visited_today=patient_visited_today,
        status="pending"
    )

    db.add(claim)
    db.commit()
    db.refresh(claim)

    for travel in travels:
        travel.claim_id = claim.id
        db.add(travel)

    db.commit()

    return claim


@router.get("/pending", response_model=list[ClaimResponse])
def get_pending_claims(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            "therapist_name": claim.therapist.username
        }
        result.append(claim_data)

    return result


@router.put("/{claim_id}/approve", response_model=ClaimResponse)
def approve_claim(
    claim_id: int,
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
    return claim


@router.put("/{claim_id}/reject", response_model=ClaimResponse)
def reject_claim(
    claim_id: int,
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

    settings = db.query(Settings).first()

    for claim in claims:

        patient_count = (
            db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).count()
        )
        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "per_km_rate": settings.per_km_rate,
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

    settings = db.query(Settings).first()

    result = []

    for claim in claims:
        # Calculate the number of travel entries for the current claim
        patient_count = (
            len(db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all())
        )

        print("Claim:", claim.id, "Patient Count:", patient_count)  # Debugging statement

        claim_data = {
            "id": claim.id,
            "claim_date": claim.claim_date,
            "total_km": claim.total_km,
            "per_km_rate": settings.per_km_rate,
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
    
@router.get("/{claim_id}/details")
def get_claim_details(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    travels = (db.query(TravelEntry).filter(TravelEntry.claim_id == claim.id).all()
    )

    return {

        "claim": {

        "id": claim.id,
        "therapist_name": claim.therapist.username,
        "claim_date": claim.claim_date,
        "total_km": claim.total_km,
        "travel_total": claim.travel_total,
        "daily_allowance": claim.daily_allowance,
        "grand_total": claim.grand_total,
        "status": claim.status,
    },

    "travels": [
        {
            "id": travel.id,
            "patient_name": travel.patient_name,
            "transport_mode": travel.transport_mode,
            "bill_amount": travel.bill_amount,
            "invoice_file": travel.invoice_file,
            "from_address": travel.from_address,
            "to_address": travel.to_address,
            "total_km": travel.total_km,
            "travel_fare": travel.travel_fare,
        }
        for travel in travels
    ]
    }

    id: int
    claim_date: date
    total_km: float
    travel_total: float
    daily_allowance: float
    grand_total: float
    patient_visited_today: bool | None = None
    status: str
    therapist_name: str | None = None
    patient_count: int | None = 0


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

    settings = (
        db.query(
            Settings
        )
        .first()
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
            settings.per_km_rate,

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