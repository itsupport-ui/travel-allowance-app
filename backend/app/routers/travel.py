from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.travel import TravelEntry
from app.models.settings import Settings
from app.models.user import User
from app.schemas.travel import TravelCreate, TravelResponse
from app.utils.auth import get_current_user, require_role
from datetime import datetime
from datetime import date
from sqlalchemy import func
from app.models.claim import Claim
from fastapi import ( Form, File, UploadFile )
import os
import shutil


router = APIRouter(
    prefix="/travel",
    tags=["Travel"]
)

@router.post(
    "/",
    response_model=
    TravelResponse
)
def create_travel(

    patient_name:
    str = Form(...),

    travel_date:
    date = Form(...),

    from_address:
    str = Form(...),

    to_address:
    str = Form(...),

    total_km:
    float = Form(0),

    patient_visited:
    bool = Form(False),

    transport_mode:
    str = Form("vehicle"),

    bill_amount:
    float | None = Form(None),

    invoice_file:
    UploadFile | None =
    File(None),

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):

    settings = (
        db.query(
            Settings
        )
        .first()
    )

    if settings is None:

        settings = Settings(
            per_km_rate=8,
            daily_allowance=150
        )

        db.add(
            settings
        )

        db.commit()

        db.refresh(
            settings
        )

    per_km_rate = (
        settings
        .per_km_rate
    )

    travel_fare = 0

    if (
        transport_mode
        ==
        "vehicle"
    ):

        travel_fare = (
            total_km
            *
            per_km_rate
        )

    elif bill_amount:

        travel_fare = (
            bill_amount
        )

    file_path = None

    if invoice_file:

        upload_dir = "uploads"

        os.makedirs(
            upload_dir,
            exist_ok=True
        )

        file_path = (
            f"uploads/"
            f"{invoice_file.filename}"
        )

        with open(
            file_path,
            "wb"
        ) as buffer:

            shutil.copyfileobj(
                invoice_file.file,
                buffer
            )

    travel = (
        TravelEntry(

            therapist_id=
            current_user.id,

            patient_name=
            patient_name,

            travel_date=
            travel_date,

            from_address=
            from_address,

            to_address=
            to_address,

            total_km=
            total_km,

            per_km_rate=
            per_km_rate,

            travel_fare=
            travel_fare,

            patient_visited=
            patient_visited,

            transport_mode=
            transport_mode,

            bill_amount=
            bill_amount,

            invoice_file=
            file_path
        )
    )

    db.add(travel
    )

    db.commit()

    db.refresh(
        travel
    )

    return travel

@router.put("/{travel_id}", response_model=TravelResponse)
def update_travel(
    travel_id: int,
    travel_data: TravelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    travel = db.query(TravelEntry).filter(TravelEntry.id == travel_id, TravelEntry.therapist_id == current_user.id).first()
    if not travel:
        raise HTTPException(status_code=404, detail="Travel entry not found")

    if travel.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this travel entry")
    settings = db.query(Settings).first()

    travel.travel_date = travel_data.travel_date
    travel.from_address = travel_data.from_address
    travel.to_address = travel_data.to_address
    travel.total_km = travel_data.total_km
    travel.patient_visited = travel_data.patient_visited
    travel.patient_name = travel_data.patient_name
    travel.per_km_rate = settings.per_km_rate
    travel.travel_fare = travel_data.total_km * settings.per_km_rate
    travel.patient_name = travel_data.patient_name
    travel.transport_mode = travel_data.transport_mode
    travel.bill_amount = travel_data.bill_amount

    claim = (
    db.query(Claim)
    .filter(
        Claim.therapist_id
        ==
        current_user.id,

        Claim.claim_date
        ==
        travel.travel_date
    )
    .first()
)
    if claim:
        claim.status = (
        "reopened"
    )

    db.commit()
    db.refresh(travel)
    return travel

@router.get(
    "/my",
    response_model=
    list[
        TravelResponse
    ]
)
def get_my_travel(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["therapist"]
        )
    )
):
    return (
        db.query(
            TravelEntry
        )
        .filter(
            TravelEntry
            .therapist_id
            ==
            current_user.id
        )
        .all()
    )


@router.get(
    "/all",
    response_model=
    list[
        TravelResponse
    ]
)
def get_all_travel(
    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        require_role(
            ["admin"]
        )
    )
):
    return (
        db.query(
            TravelEntry
        )
        .all()
    )

@router.delete("/{travel_id}")
def delete_travel(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    travel = db.query(TravelEntry).filter(TravelEntry.id == travel_id, TravelEntry.therapist_id == current_user.id).first()
    if not travel:
        raise HTTPException(status_code=404, detail="Travel entry not found")
    if travel.therapist_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this travel entry")
    
    db.delete(travel)
    db.commit()
    return {"detail": "Travel entry deleted successfully"}


# when I try to get today's travel entries, I am not getting any entries, even if I have created travel entries for today. I will check the date comparison logic in the query, and make sure that I am comparing only the date part of the datetime field in the database with today's date. I will use the date() function to extract the date part from the datetime field in the query.
@router.get("/today", response_model=list[TravelResponse])
def get_today_travel(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    today = date.today()
    travels = db.query(TravelEntry).filter(
        TravelEntry.therapist_id == current_user.id,
        func.date(TravelEntry.travel_date) == today

    ).all()
    return travels

@router.get(
    "/{travel_id}",
    response_model=
    TravelResponse
)
def get_travel_by_id(
    travel_id: int,

    db: Session =
    Depends(get_db),

    current_user:
    User = Depends(
        get_current_user
    )
):
    travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.id
            ==
            travel_id
        )
        .first()
    )

    if not travel:
        raise HTTPException(
            status_code=404,
            detail=
            "Travel not found"
        )

    if (
        travel.therapist_id
        !=
        current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=
            "Not authorized"
        )

    return travel