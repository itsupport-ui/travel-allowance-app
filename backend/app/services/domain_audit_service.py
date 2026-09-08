from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models.domain_audit_event import DomainAuditEvent
from app.models.user import User
from app.utils.timezone import india_now
from app.utils.request_context import get_client_operation_id


def record_domain_audit_event(
    db: Session,
    *,
    actor_id: int,
    domain: str,
    entity_type: str,
    entity_id: int | str,
    action: str,
    outcome: str = "success",
    actor_role: str | None = None,
    business_date: date | None = None,
    from_state: str | None = None,
    to_state: str | None = None,
    reason_code: str | None = None,
    reason: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: int | str | None = None,
    correlation_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> DomainAuditEvent:
    """Append a privacy-conscious audit event within the caller's transaction."""
    resolved_role = actor_role
    if resolved_role is None:
        resolved_role = db.query(User.role).filter(User.id == actor_id).scalar()
    if resolved_role is None:
        raise ValueError("Audit actor does not exist")

    event = DomainAuditEvent(
        domain=domain.strip().lower(),
        entity_type=entity_type.strip().lower(),
        entity_id=str(entity_id),
        action=action.strip().lower(),
        outcome=outcome.strip().lower(),
        actor_id=actor_id,
        actor_role=resolved_role,
        business_date=business_date or india_now().date(),
        from_state=from_state,
        to_state=to_state,
        reason_code=reason_code,
        reason=reason.strip() if reason else None,
        related_entity_type=(
            related_entity_type.strip().lower()
            if related_entity_type
            else None
        ),
        related_entity_id=(
            str(related_entity_id)
            if related_entity_id is not None
            else None
        ),
        correlation_id=correlation_id or get_client_operation_id(),
        details=details or {},
    )
    db.add(event)
    return event
