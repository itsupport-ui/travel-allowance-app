from datetime import date

from sqlalchemy.orm import Session

from app.models.location_policy import LocationPolicy


DEFAULT_GEOFENCE_RADIUS_M = 250.0
DEFAULT_GPS_ACCURACY_THRESHOLD_M = 250.0
DEFAULT_EVIDENCE_MAX_AGE_MINUTES = 15
DEFAULT_APPROVAL_VALID_HOURS = 8
DEFAULT_MAX_EVIDENCE_MOVEMENT_M = 250.0


def ensure_initial_location_policy(db: Session) -> LocationPolicy:
    policy = (
        db.query(LocationPolicy)
        .order_by(LocationPolicy.version.desc())
        .first()
    )
    if policy is not None:
        return policy
    policy = LocationPolicy(
        version=1,
        effective_from=date(1970, 1, 1),
        geofence_radius_m=DEFAULT_GEOFENCE_RADIUS_M,
        gps_accuracy_threshold_m=DEFAULT_GPS_ACCURACY_THRESHOLD_M,
        evidence_max_age_minutes=DEFAULT_EVIDENCE_MAX_AGE_MINUTES,
        approval_valid_hours=DEFAULT_APPROVAL_VALID_HOURS,
        max_evidence_movement_m=DEFAULT_MAX_EVIDENCE_MOVEMENT_M,
    )
    db.add(policy)
    db.flush()
    return policy


def get_location_policy(
    db: Session,
    business_date: date,
) -> LocationPolicy:
    ensure_initial_location_policy(db)
    policy = (
        db.query(LocationPolicy)
        .filter(
            LocationPolicy.effective_from <= business_date,
            (
                LocationPolicy.effective_to.is_(None)
                | (LocationPolicy.effective_to > business_date)
            ),
        )
        .order_by(
            LocationPolicy.effective_from.desc(),
            LocationPolicy.version.desc(),
        )
        .first()
    )
    if policy is None:
        return ensure_initial_location_policy(db)
    return policy


def list_location_policies(db: Session) -> list[LocationPolicy]:
    ensure_initial_location_policy(db)
    return (
        db.query(LocationPolicy)
        .order_by(
            LocationPolicy.effective_from.desc(),
            LocationPolicy.version.desc(),
        )
        .all()
    )
