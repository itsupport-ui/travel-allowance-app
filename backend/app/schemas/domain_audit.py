from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DomainAuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    domain: str
    entity_type: str
    entity_id: str
    action: str
    outcome: str
    actor_id: int
    actor_name: str | None = None
    actor_role: str
    business_date: date
    from_state: str | None = None
    to_state: str | None = None
    reason_code: str | None = None
    reason: str | None = None
    related_entity_type: str | None = None
    related_entity_id: str | None = None
    correlation_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime


class DomainAuditEventPage(BaseModel):
    items: list[DomainAuditEventResponse]
    total: int
    limit: int
    offset: int
