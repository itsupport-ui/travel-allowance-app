from fastapi import (
    APIRouter,
    HTTPException
)
from app.services.maps_service import (
    MapsServiceError,
    calculate_distance_km,
    reverse_geocode_address,
)

router = APIRouter(
    prefix="/maps",
    tags=["Maps"]
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
