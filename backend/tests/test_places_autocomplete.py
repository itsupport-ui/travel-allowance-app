import unittest
from unittest.mock import MagicMock, patch

from app.services import maps_service
from app.services.maps_service import (
    MapsServiceError,
    autocomplete_places,
    get_place_location,
)


def _response(payload, ok=True, status=200):
    response = MagicMock()
    response.ok = ok
    response.status_code = status
    response.json.return_value = payload
    return response


@patch.object(maps_service, "GOOGLE_MAPS_API_KEY", "test-key")
class PlacesAutocompleteTests(unittest.TestCase):
    def test_suggestions_are_flattened(self):
        payload = {
            "suggestions": [
                {
                    "placePrediction": {
                        "placeId": "abc123",
                        "text": {"text": "12 3rd Cross, Vijayanagar, Bengaluru"},
                        "structuredFormat": {
                            "mainText": {"text": "12 3rd Cross"},
                            "secondaryText": {"text": "Vijayanagar, Bengaluru"},
                        },
                    }
                },
                {"queryPrediction": {"text": {"text": "ignored"}}},
            ]
        }
        with patch.object(maps_service.requests, "post", return_value=_response(payload)) as post:
            suggestions = autocomplete_places("12 3rd cross", "tok")

        self.assertEqual(
            suggestions,
            [
                {
                    "place_id": "abc123",
                    "description": "12 3rd Cross, Vijayanagar, Bengaluru",
                    "main_text": "12 3rd Cross",
                    "secondary_text": "Vijayanagar, Bengaluru",
                }
            ],
        )
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["includedRegionCodes"], ["in"])
        self.assertEqual(body["sessionToken"], "tok")

    def test_autocomplete_error_is_reported(self):
        with patch.object(maps_service.requests, "post", return_value=_response({}, ok=False, status=403)):
            with self.assertRaises(MapsServiceError):
                autocomplete_places("12 3rd cross")

    def test_place_location_returns_exact_pin(self):
        payload = {
            "id": "abc123",
            "displayName": {"text": "Sai Residency"},
            "formattedAddress": "Kondapur, Hyderabad, Telangana 500084, India",
            "location": {"latitude": 17.4699, "longitude": 78.3578},
        }
        with patch.object(maps_service.requests, "get", return_value=_response(payload)):
            place = get_place_location("abc123", "tok")

        self.assertEqual(place["latitude"], 17.4699)
        self.assertEqual(place["longitude"], 78.3578)
        self.assertEqual(
            place["address"],
            "Sai Residency, Kondapur, Hyderabad, Telangana 500084, India",
        )

    def test_place_without_location_is_rejected(self):
        with patch.object(maps_service.requests, "get", return_value=_response({"id": "x"})):
            with self.assertRaises(MapsServiceError):
                get_place_location("x")


if __name__ == "__main__":
    unittest.main()
