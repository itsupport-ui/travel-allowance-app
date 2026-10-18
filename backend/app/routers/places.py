from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.place import Place
from app.models.user import User
from app.schemas.place import PlaceCreate, PlaceResponse, PlaceUpdate
from app.services.schedule_location_service import (
    has_valid_coordinates,
    resolve_patient_coordinates,
)
from app.utils.auth import require_permission

router = APIRouter(prefix="/places", tags=["Places"])


def _resolve_coordinates(
    address: str,
    latitude: float | None,
    longitude: float | None,
) -> tuple[float, float]:
    if latitude is not None and longitude is not None:
        if not has_valid_coordinates(latitude, longitude):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The place coordinates are invalid.",
            )
        return latitude, longitude
    try:
        return resolve_patient_coordinates(address)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unable to locate this address. Check it or enter the "
                "latitude and longitude."
            ),
        ) from error


def _get_place(db: Session, place_id: int) -> Place:
    place = db.query(Place).filter(Place.id == place_id).first()
    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Place not found.",
        )
    return place


@router.get("", response_model=list[PlaceResponse])
def list_places(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("places.manage")),
):
    query = db.query(Place)
    if not include_inactive:
        query = query.filter(Place.active.is_(True))
    return query.order_by(Place.name).all()


@router.post(
    "",
    response_model=PlaceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_place(
    payload: PlaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("places.manage")),
):
    latitude, longitude = _resolve_coordinates(
        payload.address,
        payload.latitude,
        payload.longitude,
    )
    place = Place(
        name=payload.name.strip(),
        place_type=payload.place_type,
        address=payload.address.strip(),
        latitude=latitude,
        longitude=longitude,
        radius_m=payload.radius_m,
        created_by=current_user.id,
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


@router.put("/{place_id}", response_model=PlaceResponse)
def update_place(
    place_id: int,
    payload: PlaceUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("places.manage")),
):
    place = _get_place(db, place_id)
    changes = payload.model_dump(exclude_unset=True)
    address_changed = "address" in changes and changes["address"] != place.address
    coordinates_given = (
        changes.get("latitude") is not None
        and changes.get("longitude") is not None
    )
    if address_changed or coordinates_given:
        place.latitude, place.longitude = _resolve_coordinates(
            changes.get("address", place.address),
            changes.get("latitude"),
            changes.get("longitude"),
        )
    for field in ("name", "place_type", "address", "radius_m", "active"):
        if field in changes:
            value = changes[field]
            setattr(
                place,
                field,
                value.strip() if isinstance(value, str) else value,
            )
    db.commit()
    db.refresh(place)
    return place
