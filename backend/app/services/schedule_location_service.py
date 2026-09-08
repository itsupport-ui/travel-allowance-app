import math

from app.services.maps_service import (
    geocode_address,
    straight_line_distance_km,
)


ARRIVAL_RADIUS_KM = 0.25
GEOCODING_FAILURE_MESSAGE = (
    "Unable to verify the patient's location. "
    "Please check the address and try again."
)
MISSING_PATIENT_LOCATION_MESSAGE = (
    "Patient location has not been configured. "
    "Please contact the administrator."
)


def _is_valid_coordinate(
    value: float | None,
    minimum: float,
    maximum: float,
) -> bool:
    if value is None:
        return False

    try:
        coordinate = float(value)
    except (TypeError, ValueError):
        return False

    return math.isfinite(coordinate) and minimum <= coordinate <= maximum


def has_valid_coordinates(
    latitude: float | None,
    longitude: float | None,
) -> bool:
    return _is_valid_coordinate(latitude, -90, 90) and _is_valid_coordinate(
        longitude,
        -180,
        180,
    )


def resolve_patient_coordinates(address: str) -> tuple[float, float]:
    coordinates = geocode_address(address.strip())

    if coordinates is None or not has_valid_coordinates(*coordinates):
        raise ValueError(GEOCODING_FAILURE_MESSAGE)

    return float(coordinates[0]), float(coordinates[1])


def validate_patient_arrival(
    *,
    arrival_latitude: float,
    arrival_longitude: float,
    patient_latitude: float | None,
    patient_longitude: float | None,
    radius_km: float = ARRIVAL_RADIUS_KM,
) -> float:
    if not has_valid_coordinates(patient_latitude, patient_longitude):
        raise ValueError(MISSING_PATIENT_LOCATION_MESSAGE)

    if not has_valid_coordinates(arrival_latitude, arrival_longitude):
        raise ValueError("The captured current location is invalid. Please try again.")

    distance_km = straight_line_distance_km(
        arrival_latitude,
        arrival_longitude,
        float(patient_latitude),
        float(patient_longitude),
    )

    if radius_km <= 0:
        raise ValueError("The configured patient visit radius is invalid.")

    if distance_km > radius_km:
        raise ValueError(
            f"You are {distance_km:.2f} km away from the patient's location. "
            f"The allowed radius is {radius_km * 1000:.0f} metres. "
            "Please reach the patient's destination before continuing."
        )

    return distance_km
