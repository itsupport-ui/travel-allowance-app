from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.domain_audit_event import DomainAuditEvent
from app.models.user import User
from app.schemas.domain_audit import (
    DomainAuditEventPage,
    DomainAuditEventResponse,
)
from app.utils.auth import require_permission


router = APIRouter(prefix="/audit-events", tags=["Audit Events"])


@router.get("/", response_model=DomainAuditEventPage)
def list_domain_audit_events(
    domain: str | None = Query(None, max_length=50),
    entity_type: str | None = Query(None, max_length=80),
    entity_id: str | None = Query(None, max_length=100),
    action: str | None = Query(None, max_length=80),
    actor_id: int | None = Query(None),
    actor_role: str | None = Query(None, max_length=30),
    actor_name: str | None = Query(None, max_length=120),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("audit.view")),
):
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date cannot be later than to_date",
        )
    query = db.query(DomainAuditEvent)
    if domain:
        query = query.filter(DomainAuditEvent.domain == domain.strip().lower())
    if entity_type:
        query = query.filter(
            DomainAuditEvent.entity_type == entity_type.strip().lower()
        )
    if entity_id:
        query = query.filter(DomainAuditEvent.entity_id == entity_id.strip())
    if action:
        query = query.filter(DomainAuditEvent.action == action.strip().lower())
    if actor_id is not None:
        query = query.filter(DomainAuditEvent.actor_id == actor_id)
    if actor_role:
        query = query.filter(
            DomainAuditEvent.actor_role == actor_role.strip().lower()
        )
    if actor_name:
        query = query.join(User, User.id == DomainAuditEvent.actor_id).filter(
            User.username.ilike(f"%{actor_name.strip()}%")
        )
    if from_date is not None:
        query = query.filter(DomainAuditEvent.business_date >= from_date)
    if to_date is not None:
        query = query.filter(DomainAuditEvent.business_date <= to_date)

    total = query.count()
    events = (
        query.order_by(
            DomainAuditEvent.occurred_at.desc(),
            DomainAuditEvent.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    actor_ids = {event.actor_id for event in events}
    actor_names = dict(
        db.query(User.id, User.username).filter(User.id.in_(actor_ids)).all()
    ) if actor_ids else {}
    return DomainAuditEventPage(
        items=[
            DomainAuditEventResponse.model_validate(event).model_copy(
                update={"actor_name": actor_names.get(event.actor_id)}
            )
            for event in events
        ],
        total=total,
        limit=limit,
        offset=offset,
    )
