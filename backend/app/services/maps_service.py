import os
import math
import logging
import requests
from dotenv import load_dotenv
from app.config import GOOGLE_MAPS_API_KEY as CONFIG_GOOGLE_MAPS_API_KEY

load_dotenv()

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", CONFIG_GOOGLE_MAPS_API_KEY)
logger = logging.getLogger(__name__)


class MapsServiceError(ValueError):
    """Raised when a Maps provider cannot produce a valid route."""


def _coordinate_waypoint(latitude: float, longitude: float) -> dict:
    return {
        "location": {
            "latLng": {
                "latitude": float(latitude),
                "longitude": float(longitude),
            }
        }
    }


def _address_waypoint(address: str) -> dict:
    return {"address": address}


def _build_waypoint(address=None, latitude=None, longitude=None) -> dict | None:
    if latitude is not None and longitude is not None:
        return _coordinate_waypoint(latitude, longitude)
    if address:
        return _address_waypoint(address)
    return None


def calculate_distance_km(
    from_address: str | None = None,
    to_address: str | None = None,
    from_latitude: float | None = None,
    from_longitude: float | None = None,
    to_latitude: float | None = None,
    to_longitude: float | None = None,
) -> float:
    """Call Google Routes API v2 and return driving distance in kilometers."""
    origin = _build_waypoint(from_address, from_latitude, from_longitude)
    destination = _build_waypoint(to_address, to_latitude, to_longitude)

    if not GOOGLE_MAPS_API_KEY:
        raise MapsServiceError("Maps service is not configured.")

    if not origin or not destination:
        raise MapsServiceError(
            "Both an origin and destination are required to calculate distance."
        )

    url = "https://routes.googleapis.com/directions/v2:computeRoutes"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters",
    }

    body = {
        "origin": origin,
        "destination": destination,
        "travelMode": "DRIVE",
    }

    try:
        response = requests.post(url, headers=headers, json=body, timeout=10)
    except requests.Timeout as error:
        logger.warning("Google Routes request timed out.")
        raise MapsServiceError(
            "Distance calculation timed out. Please try again."
        ) from error
    except requests.RequestException as error:
        logger.warning(
            "Google Routes request failed: %s",
            type(error).__name__,
        )
        raise MapsServiceError(
            "Distance service is currently unavailable. Please try again."
        ) from error

    if not response.ok:
        google_status = None

        try:
            error_data = response.json()
            error_details = error_data.get("error")

            if isinstance(error_details, dict):
                google_status = error_details.get("status")
        except (TypeError, ValueError):
            pass

        logger.warning(
            "Google Routes returned HTTP %s with status %s.",
            response.status_code,
            google_status or "unknown",
        )
        raise MapsServiceError(
            "Distance service rejected the route request. "
            "Please verify the locations."
        )

    try:
        data = response.json()
    except (TypeError, ValueError) as error:
        logger.warning("Google Routes returned malformed JSON.")
        raise MapsServiceError(
            "Distance service returned an invalid response. Please try again."
        ) from error

    if not isinstance(data, dict):
        logger.warning("Google Routes response was not an object.")
        raise MapsServiceError(
            "Distance service returned an invalid response. Please try again."
        )

    routes = data.get("routes")

    if not isinstance(routes, list) or not routes:
        logger.warning("Google Routes returned no routes.")
        raise MapsServiceError(
            "Could not calculate distance between the locations. "
            "Please verify addresses and try again."
        )

    route = routes[0]

    if not isinstance(route, dict):
        logger.warning("Google Routes returned an invalid route.")
        raise MapsServiceError(
            "Distance service returned an invalid response. Please try again."
        )

    # Protobuf JSON omits scalar fields at their default value. A valid route
    # without distanceMeters therefore represents a zero-meter route.
    distance_meters = route.get("distanceMeters", 0)

    if (
        isinstance(distance_meters, bool)
        or not isinstance(distance_meters, (int, float))
        or distance_meters < 0
    ):
        logger.warning("Google Routes returned an invalid distance value.")
        raise MapsServiceError(
            "Distance service returned an invalid response. Please try again."
        )

    return round(float(distance_meters) / 1000, 2)


def geocode_address(address: str) -> tuple[float, float] | None:
    if not GOOGLE_MAPS_API_KEY or not address:
        return None

    url = "https://maps.googleapis.com/maps/api/geocode/json"

    try:
        response = requests.get(
            url,
            params={"address": address, "key": GOOGLE_MAPS_API_KEY},
            timeout=10,
        )
        data = response.json()
        result = data.get("results", [None])[0]
        location = result["geometry"]["location"]
        return float(location["lat"]), float(location["lng"])
    except Exception:
        return None


def reverse_geocode_address(latitude: float, longitude: float) -> str | None:
    if not GOOGLE_MAPS_API_KEY:
        return None

    url = "https://maps.googleapis.com/maps/api/geocode/json"

    try:
        response = requests.get(
            url,
            params={
                "latlng": f"{latitude},{longitude}",
                "key": GOOGLE_MAPS_API_KEY,
            },
            timeout=10,
        )
        data = response.json()
        result = data.get("results", [None])[0]
        return result.get("formatted_address")
    except Exception:
        return None


def straight_line_distance_km(
    from_latitude: float,
    from_longitude: float,
    to_latitude: float,
    to_longitude: float,
) -> float:
    earth_radius_km = 6371
    lat1 = math.radians(float(from_latitude))
    lon1 = math.radians(float(from_longitude))
    lat2 = math.radians(float(to_latitude))
    lon2 = math.radians(float(to_longitude))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c
