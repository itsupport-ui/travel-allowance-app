from pathlib import Path
import sqlite3


DATABASE_PATH = Path(__file__).with_name("travel_allowance.db")
FLOAT_CLAIM_COLUMNS = {
    "total_km",
    "travel_total",
    "daily_allowance",
    "grand_total",
    "per_km_rate",
    "distance_km",
}


def column_types(connection: sqlite3.Connection, table: str) -> dict[str, str]:
    return {
        row[1]: row[2].upper()
        for row in connection.execute(f"PRAGMA table_info({table})")
    }


def add_missing_columns(connection: sqlite3.Connection) -> None:
    treatment_schedule_columns = column_types(connection, "treatment_schedules")
    travel_entry_columns = column_types(connection, "travel_entries")

    if "transport_mode" not in treatment_schedule_columns:
        connection.execute(
            "ALTER TABLE treatment_schedules "
            "ADD COLUMN transport_mode VARCHAR DEFAULT 'vehicle'"
        )
        print("Added transport_mode to treatment_schedules")

    if "patient_latitude" not in treatment_schedule_columns:
        connection.execute(
            "ALTER TABLE treatment_schedules "
            "ADD COLUMN patient_latitude REAL"
        )
        print("Added patient_latitude to treatment_schedules")

    if "patient_longitude" not in treatment_schedule_columns:
        connection.execute(
            "ALTER TABLE treatment_schedules "
            "ADD COLUMN patient_longitude REAL"
        )
        print("Added patient_longitude to treatment_schedules")

    if "schedule_id" not in travel_entry_columns:
        connection.execute(
            "ALTER TABLE travel_entries ADD COLUMN schedule_id INTEGER "
            "REFERENCES treatment_schedules(id)"
        )
        print("Added schedule_id to travel_entries")


def add_travel_schedule_unique_index(connection: sqlite3.Connection) -> None:
    duplicates = connection.execute(
        """
        SELECT therapist_id, schedule_id, COUNT(*)
        FROM travel_entries
        WHERE schedule_id IS NOT NULL
        GROUP BY therapist_id, schedule_id
        HAVING COUNT(*) > 1
        """
    ).fetchall()

    if duplicates:
        raise RuntimeError(
            "Duplicate therapist/schedule travel entries must be resolved "
            f"before migration: {duplicates}"
        )

    connection.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_travel_entries_therapist_schedule
        ON travel_entries (therapist_id, schedule_id)
        WHERE schedule_id IS NOT NULL
        """
    )
    print("Verified unique therapist/schedule travel entry index")


def migrate_claim_amounts_to_float(connection: sqlite3.Connection) -> bool:
    claim_types = column_types(connection, "claims")
    if not claim_types:
        print("claims table does not exist; no claim migration was needed")
        return False

    if all(claim_types.get(column) == "REAL" for column in FLOAT_CLAIM_COLUMNS):
        print("Claim amount columns are already REAL")
        return False

    connection.execute(
        """
        CREATE TABLE claims_new (
            id INTEGER NOT NULL,
            therapist_id INTEGER NOT NULL,
            claim_date DATE NOT NULL,
            total_km REAL,
            travel_total REAL,
            daily_allowance REAL,
            grand_total REAL,
            patient_visited_today VARCHAR,
            status VARCHAR,
            remarks VARCHAR,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            per_km_rate REAL,
            schedule_id INTEGER,
            from_address VARCHAR,
            to_address VARCHAR,
            auto_generated BOOLEAN,
            source_type VARCHAR,
            distance_km REAL,
            distance_source VARCHAR,
            PRIMARY KEY (id),
            FOREIGN KEY(therapist_id) REFERENCES users (id),
            FOREIGN KEY(schedule_id) REFERENCES treatment_schedules (id)
        )
        """
    )
    connection.execute(
        """
        INSERT INTO claims_new (
            id, therapist_id, claim_date, total_km, travel_total,
            daily_allowance, grand_total, patient_visited_today, status,
            remarks, submitted_at, per_km_rate, schedule_id, from_address,
            to_address, auto_generated, source_type, distance_km,
            distance_source
        )
        SELECT
            id, therapist_id, claim_date, CAST(total_km AS REAL),
            CAST(travel_total AS REAL), CAST(daily_allowance AS REAL),
            CAST(grand_total AS REAL), patient_visited_today, status, remarks,
            submitted_at, CAST(per_km_rate AS REAL), schedule_id, from_address,
            to_address, auto_generated, source_type,
            CAST(distance_km AS REAL), distance_source
        FROM claims
        """
    )
    connection.execute("DROP TABLE claims")
    connection.execute("ALTER TABLE claims_new RENAME TO claims")
    connection.execute("CREATE INDEX ix_claims_id ON claims (id)")
    print("Migrated claim amount columns from INTEGER to REAL")
    return True


def backfill_claim_per_km_rates(connection: sqlite3.Connection) -> None:
    cursor = connection.execute(
        """
        UPDATE claims
        SET per_km_rate = (
            SELECT travel_entries.per_km_rate
            FROM travel_entries
            WHERE travel_entries.claim_id = claims.id
              AND LOWER(travel_entries.transport_mode) = 'vehicle'
              AND travel_entries.per_km_rate IS NOT NULL
            ORDER BY travel_entries.id
            LIMIT 1
        )
        WHERE (claims.per_km_rate IS NULL OR claims.per_km_rate = 0)
          AND EXISTS (
              SELECT 1
              FROM travel_entries
              WHERE travel_entries.claim_id = claims.id
                AND LOWER(travel_entries.transport_mode) = 'vehicle'
                AND travel_entries.per_km_rate IS NOT NULL
          )
        """
    )
    print(f"Backfilled per-KM rate for {cursor.rowcount} claim(s)")


def main() -> None:
    connection = sqlite3.connect(DATABASE_PATH)
    try:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute("BEGIN")
        add_missing_columns(connection)
        add_travel_schedule_unique_index(connection)
        migrate_claim_amounts_to_float(connection)
        backfill_claim_per_km_rates(connection)
        violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(f"Foreign key check failed: {violations}")
        connection.commit()
        connection.execute("PRAGMA foreign_keys = ON")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    print(f"Migration complete: {DATABASE_PATH}")


if __name__ == "__main__":
    main()
