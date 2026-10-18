from app.models.place import Place
from app.services.maps_service import straight_line_distance_km
from app.services.schedule_location_service import has_valid_coordinates


def place_radius_m(place: Place, policy_radius_m: float) -> float:
    return float(place.radius_m or policy_radius_m)


def validate_place_arrival(
    *,
    arrival_latitude: float,
    arrival_longitude: float,
    place: Place,
    radius_m: float,
) -> float:
    """Return the distance in km, or raise ValueError when outside the radius."""
    if not has_valid_coordinates(place.latitude, place.longitude):
        raise ValueError(
            "This place has no valid location configured. "
            "Please contact the administrator."
        )
    if not has_valid_coordinates(arrival_latitude, arrival_longitude):
        raise ValueError(
            "The captured current location is invalid. Please try again."
        )
    if radius_m <= 0:
        raise ValueError("The configured place radius is invalid.")

    distance_km = straight_line_distance_km(
        arrival_latitude,
        arrival_longitude,
        float(place.latitude),
        float(place.longitude),
    )
    if distance_km > radius_m / 1000:
        raise ValueError(
            f"You are {distance_km:.2f} km away from {place.name}. "
            f"The allowed radius is {radius_m:.0f} metres. "
            "Please reach the location before continuing."
        )
    return distance_km
