import unittest
from unittest.mock import Mock, patch

import requests

from app.services import maps_service


class CalculateDistanceTests(unittest.TestCase):
    def setUp(self):
        self.api_key_patcher = patch.object(
            maps_service,
            "GOOGLE_MAPS_API_KEY",
            "test-key",
        )
        self.api_key_patcher.start()
        self.addCleanup(self.api_key_patcher.stop)

    @staticmethod
    def response(payload, status_code=200):
        response = Mock()
        response.ok = 200 <= status_code < 300
        response.status_code = status_code
        response.json.return_value = payload
        return response

    @patch.object(maps_service.requests, "post")
    def test_returns_rounded_positive_distance(self, post):
        post.return_value = self.response(
            {"routes": [{"distanceMeters": 1234}]}
        )

        distance = maps_service.calculate_distance_km(
            from_address="Origin",
            to_address="Destination",
        )

        self.assertEqual(distance, 1.23)

    @patch.object(maps_service.requests, "post")
    def test_missing_distance_field_is_valid_zero_distance(self, post):
        post.return_value = self.response({"routes": [{}]})

        distance = maps_service.calculate_distance_km(
            from_latitude=13.0908684,
            from_longitude=77.604961,
            to_latitude=13.0908684,
            to_longitude=77.604961,
        )

        self.assertEqual(distance, 0.0)

    @patch.object(maps_service.requests, "post")
    def test_empty_routes_raise_service_error(self, post):
        post.return_value = self.response({"routes": []})

        with self.assertRaises(maps_service.MapsServiceError):
            maps_service.calculate_distance_km(
                from_address="Origin",
                to_address="Destination",
            )

    @patch.object(maps_service.requests, "post")
    def test_timeout_raises_service_error(self, post):
        post.side_effect = requests.Timeout("timed out")

        with self.assertRaisesRegex(
            maps_service.MapsServiceError,
            "timed out",
        ):
            maps_service.calculate_distance_km(
                from_address="Origin",
                to_address="Destination",
            )

    @patch.object(maps_service.requests, "post")
    def test_network_failure_raises_service_error(self, post):
        post.side_effect = requests.ConnectionError("offline")

        with self.assertRaisesRegex(
            maps_service.MapsServiceError,
            "currently unavailable",
        ):
            maps_service.calculate_distance_km(
                from_address="Origin",
                to_address="Destination",
            )

    @patch.object(maps_service.requests, "post")
    def test_malformed_json_raises_service_error(self, post):
        response = self.response({})
        response.json.side_effect = ValueError("invalid JSON")
        post.return_value = response

        with self.assertRaisesRegex(
            maps_service.MapsServiceError,
            "invalid response",
        ):
            maps_service.calculate_distance_km(
                from_address="Origin",
                to_address="Destination",
            )

    @patch.object(maps_service.requests, "post")
    def test_google_http_error_raises_service_error(self, post):
        post.return_value = self.response(
            {
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                }
            },
            status_code=429,
        )

        with self.assertRaisesRegex(
            maps_service.MapsServiceError,
            "rejected the route request",
        ):
            maps_service.calculate_distance_km(
                from_address="Origin",
                to_address="Destination",
            )


if __name__ == "__main__":
    unittest.main()
