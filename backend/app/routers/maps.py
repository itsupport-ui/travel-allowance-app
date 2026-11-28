from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from app.services.maps_service import (
    MapsServiceError,
    autocomplete_places,
    calculate_distance_km,
    get_place_location,
    reverse_geocode_address,
)
from app.utils.auth import get_current_user

router = APIRouter(
    prefix="/maps",
    tags=["Maps"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "/distance"
)
def get_distance(
    from_location: str,
    to_location: str
):

    try:
        distance_km = calculate_distance_km(
            from_address=from_location,
            to_address=to_location
        )
    except MapsServiceError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    return {
        "distance_km":
        distance_km
    }


@router.get("/reverse-geocode")
def reverse_geocode(
    latitude: float,
    longitude: float
):
    address = reverse_geocode_address(latitude, longitude)

    if not address:
        raise HTTPException(
            status_code=400,
            detail="Could not resolve address for current location"
        )

    return {"address": address}


@router.get("/autocomplete")
def address_autocomplete(
    q: str = Query(min_length=3, max_length=200),
    session_token: str | None = Query(default=None, max_length=100),
):
    """Suggestions while typing an address, like Google Maps or a cab app."""
    try:
        return {"suggestions": autocomplete_places(q.strip(), session_token)}
    except MapsServiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/place")
def place_location(
    place_id: str = Query(min_length=3, max_length=300, pattern=r"^[A-Za-z0-9_-]+$"),
    session_token: str | None = Query(default=None, max_length=100),
):
    """Exact coordinates of the address the user picked from suggestions."""
    try:
        return get_place_location(place_id, session_token)
    except MapsServiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
