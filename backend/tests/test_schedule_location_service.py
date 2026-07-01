import unittest
from unittest.mock import patch

from app.services import schedule_location_service


class ScheduleLocationServiceTests(unittest.TestCase):
    @patch.object(
        schedule_location_service,
        "geocode_address",
        return_value=(13.0, 77.0),
    )
    def test_resolve_patient_coordinates(self, geocode):
        self.assertEqual(
            schedule_location_service.resolve_patient_coordinates(
                " Patient address "
            ),
            (13.0, 77.0),
        )
        geocode.assert_called_once_with("Patient address")

    @patch.object(
        schedule_location_service,
        "geocode_address",
        return_value=None,
    )
    def test_geocoding_failure_is_not_silently_ignored(self, geocode):
        with self.assertRaisesRegex(ValueError, "Unable to verify"):
            schedule_location_service.resolve_patient_coordinates(
                "Unknown address"
            )

    @patch.object(
        schedule_location_service,
        "straight_line_distance_km",
        return_value=0.25,
    )
    def test_250_metre_boundary_is_allowed(self, distance):
        result = schedule_location_service.validate_patient_arrival(
            arrival_latitude=13.0,
            arrival_longitude=77.0,
            patient_latitude=13.0,
            patient_longitude=77.0,
        )

        self.assertEqual(result, 0.25)

    @patch.object(
        schedule_location_service,
        "straight_line_distance_km",
        return_value=0.26,
    )
    def test_more_than_250_metres_is_rejected(self, distance):
        with self.assertRaisesRegex(ValueError, "Please reach"):
            schedule_location_service.validate_patient_arrival(
                arrival_latitude=13.0,
                arrival_longitude=77.0,
                patient_latitude=13.0,
                patient_longitude=77.0,
            )


if __name__ == "__main__":
    unittest.main()
