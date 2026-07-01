from pathlib import Path
import mimetypes

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.travel import TravelEntry
from app.models.settings import Settings
from app.models.user import User
from app.schemas.travel import TravelResponse
from app.utils.auth import get_current_user, require_role
from datetime import date
from sqlalchemy import func
from fastapi import ( Form, File, UploadFile )
import os
import shutil


router = APIRouter(
    prefix="/travel",
    tags=["Travel"]
)

UPLOAD_ROOT = Path("uploads").resolve()


def resolve_invoice_path(invoice_file: str) -> Path:
    stored_path = Path(invoice_file)
    candidate = (
        stored_path.resolve()
        if stored_path.is_absolute()
        else (Path.cwd() / stored_path).resolve()
    )

    try:
        candidate.relative_to(UPLOAD_ROOT)
    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail="Invoice file not found",
        ) from error

    if not candidate.is_file():
        raise HTTPException(
            status_code=404,
            detail="Invoice file not found",
        )

    return candidate

@router.post(
    "/",
    response_model=
    TravelResponse
)
def create_travel(

    patient_name:
    str | None = Form(None),

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

        safe_filename = Path(invoice_file.filename or "invoice").name
        file_path = f"uploads/{safe_filename}"

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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["therapist"]))
):
    travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.id == travel_id,
            TravelEntry.therapist_id == current_user.id,
        )
        .first()
    )
    if not travel:
        raise HTTPException(status_code=404, detail="Travel entry not found")

    raise HTTPException(
        status_code=403,
        detail="Travel entries cannot be edited after creation",
    )

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
    travel = (
        db.query(TravelEntry)
        .filter(
            TravelEntry.id == travel_id,
            TravelEntry.therapist_id == current_user.id,
        )
        .first()
    )
    if not travel:
        raise HTTPException(status_code=404, detail="Travel entry not found")

    raise HTTPException(
        status_code=403,
        detail="Travel entries cannot be deleted after creation",
    )


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


@router.get("/{travel_id}/invoice")
def get_travel_invoice(
    travel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    travel = (
        db.query(TravelEntry)
        .filter(TravelEntry.id == travel_id)
        .first()
    )

    if not travel:
        raise HTTPException(status_code=404, detail="Travel not found")

    if (
        current_user.role != "admin"
        and travel.therapist_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    if not travel.invoice_file:
        raise HTTPException(
            status_code=404,
            detail="No invoice is attached to this travel entry",
        )

    invoice_path = resolve_invoice_path(travel.invoice_file)
    media_type = (
        mimetypes.guess_type(invoice_path.name)[0]
        or "application/octet-stream"
    )

    return FileResponse(
        path=invoice_path,
        media_type=media_type,
        filename=invoice_path.name,
    )

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
