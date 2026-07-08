from __future__ import annotations

from collections.abc import Mapping

from fastapi import HTTPException, status

DOCTOR_CONSULTATION_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "scheduled": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}

DOCTOR_CONSULTATION_DECISION_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"confirmed", "rejected", "follow_up"},
    "follow_up": {"confirmed", "rejected"},
    "confirmed": set(),
    "rejected": set(),
}

DOCTOR_VISIT_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "scheduled": {"visited", "cancelled"},
    "visited": {"treatment_plan_submitted"},
    "treatment_plan_submitted": set(),
    "cancelled": set(),
}

TREATMENT_PLAN_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"submitted"},
    "submitted": {"approved", "rejected"},
    "approved": set(),
    "rejected": set(),
}

TREATMENT_SCHEDULE_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "scheduled": {"completed", "missed", "cancelled"},
    "completed": set(),
    "missed": set(),
    "cancelled": set(),
}

DOCTOR_CLAIM_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"approved", "rejected"},
    "approved": set(),
    "rejected": set(),
    "submitted": {"pending"},
}

THERAPIST_CLAIM_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"approved", "rejected"},
    "approved": set(),
    "rejected": set(),
}

LOCKED_CLAIM_PLAN_STATUSES: set[str] = {"approved", "rejected"}


def validate_status_transition(
    *,
    entity: str,
    current_status: str,
    next_status: str,
    transitions: Mapping[str, set[str]],
    allow_noop: bool = False,
) -> None:
    if current_status == next_status and allow_noop:
        return

    allowed_next_statuses = transitions.get(current_status, set())
    if next_status in allowed_next_statuses:
        return

    if not allowed_next_statuses:
        allowed_text = "none"
    else:
        allowed_text = ", ".join(sorted(allowed_next_statuses))

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"Invalid {entity} transition from '{current_status}' "
            f"to '{next_status}'. Allowed next statuses: {allowed_text}."
        ),
    )


def validate_editable_status(
    *,
    entity: str,
    current_status: str,
    locked_statuses: set[str] = LOCKED_CLAIM_PLAN_STATUSES,
) -> None:
    if current_status in locked_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{entity} with status '{current_status}' cannot be edited."
            ),
        )
