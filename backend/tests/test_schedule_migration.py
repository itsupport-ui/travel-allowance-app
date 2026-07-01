import sqlite3
import unittest

from migrate import (
    add_missing_columns,
    add_travel_schedule_unique_index,
    column_types,
)


class ScheduleMigrationTests(unittest.TestCase):
    def setUp(self):
        self.connection = sqlite3.connect(":memory:")
        self.connection.execute(
            """
            CREATE TABLE treatment_schedules (
                id INTEGER PRIMARY KEY,
                patient_address VARCHAR NOT NULL
            )
            """
        )
        self.connection.execute(
            """
            CREATE TABLE travel_entries (
                id INTEGER PRIMARY KEY,
                therapist_id INTEGER NOT NULL,
                schedule_id INTEGER
            )
            """
        )

    def tearDown(self):
        self.connection.close()

    def test_coordinate_columns_and_unique_index_are_idempotent(self):
        add_missing_columns(self.connection)
        add_travel_schedule_unique_index(self.connection)
        add_missing_columns(self.connection)
        add_travel_schedule_unique_index(self.connection)

        columns = column_types(self.connection, "treatment_schedules")
        self.assertEqual(columns["patient_latitude"], "REAL")
        self.assertEqual(columns["patient_longitude"], "REAL")

        indexes = {
            row[1]
            for row in self.connection.execute(
                "PRAGMA index_list(travel_entries)"
            )
        }
        self.assertIn("uq_travel_entries_therapist_schedule", indexes)

    def test_existing_duplicates_abort_unique_index_creation(self):
        self.connection.executemany(
            """
            INSERT INTO travel_entries (therapist_id, schedule_id)
            VALUES (?, ?)
            """,
            [(1, 10), (1, 10)],
        )

        with self.assertRaisesRegex(RuntimeError, "Duplicate"):
            add_travel_schedule_unique_index(self.connection)


if __name__ == "__main__":
    unittest.main()
