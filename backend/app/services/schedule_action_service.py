from __future__ import annotations

from typing import Any


def schedule_action_metadata(schedule: Any, *, role: str) -> dict[str, Any]:
    """Return presentation-independent actions for a schedule occurrence.

    Authorization remains enforced by the mutation endpoints.  This metadata lets
    each client render the same next step without reimplementing state rules.
    """

    status = (getattr(schedule, "status", "") or "").lower()
    session_status = (
        getattr(schedule, "session_status", "NOT_STARTED") or "NOT_STARTED"
    ).upper()
    actions = ["view_details"]
    blockers: list[str] = []
    next_action: str | None = "view_details"

    if role == "admin":
        if status == "scheduled" and session_status == "NOT_STARTED":
            actions.extend(["edit", "cancel"])
            next_action = "edit"
        elif status == "scheduled" and session_status == "IN_PROGRESS":
            actions.append("monitor_session")
            blockers.append("SESSION_IN_PROGRESS")
            next_action = "monitor_session"
        elif status == "completed":
            actions.append("view_completion")
            next_action = "view_completion"
        elif status == "missed":
            actions.append("view_missed_details")
            next_action = "view_missed_details"
        elif status in {"cancelled", "canceled"}:
            blockers.append("SCHEDULE_CANCELLED")
    elif role == "therapist":
        if status == "scheduled" and session_status == "NOT_STARTED":
            actions.append("review_session_readiness")
            next_action = "review_session_readiness"
        elif status == "scheduled" and session_status == "IN_PROGRESS":
            actions.append("resume_session")
            next_action = "resume_session"
        elif status == "completed":
            actions.append("view_completion")
            next_action = "view_completion"
        elif status == "missed":
            actions.append("view_missed_details")
            next_action = "view_missed_details"
        elif status in {"cancelled", "canceled"}:
            blockers.append("SCHEDULE_CANCELLED")

    return {
        "available_actions": actions,
        "blocking_reasons": blockers,
        "next_action": next_action,
    }


def apply_schedule_action_metadata(schedule: Any, *, role: str) -> Any:
    for field, value in schedule_action_metadata(schedule, role=role).items():
        setattr(schedule, field, value)
    return schedule


def apply_schedule_list_action_metadata(
    schedules: list[Any], *, role: str
) -> list[Any]:
    for schedule in schedules:
        apply_schedule_action_metadata(schedule, role=role)
    return schedules
