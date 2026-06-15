import os
import requests

from fastapi import (
    APIRouter,
    HTTPException
)

from dotenv import (
    load_dotenv
)

load_dotenv()

router = APIRouter(
    prefix="/maps",
    tags=["Maps"]
)

API_KEY = os.getenv(
    "GOOGLE_MAPS_API_KEY"
)


@router.get(
    "/distance"
)
def get_distance(
    from_location: str,
    to_location: str
):

    url = (
        "https://routes.googleapis.com"
        "/directions/v2:computeRoutes"
    )

    headers = {
        "Content-Type":
            "application/json",

        "X-Goog-Api-Key":
            API_KEY,

        "X-Goog-FieldMask":
            "routes.distanceMeters"
    }

    body = {

        "origin": {
            "address":
            from_location
        },

        "destination": {
            "address":
            to_location
        },

        "travelMode":
        "DRIVE"
    }

    response = requests.post(
        url,
        headers=headers,
        json=body
    )

    data = response.json()

    if "routes" not in data:

        raise HTTPException(
            status_code=400,
            detail=data
        )

    distance_meters = (
        data["routes"][0]
        ["distanceMeters"]
    )

    distance_km = (
        round(
            distance_meters
            / 1000,
            2
        )
    )

    return {
        "distance_km":
        distance_km
    }