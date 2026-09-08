from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


ALLOWED_DOMAINS = {
    "attendance",
    "clinical",
    "claims",
    "expenses",
    "location",
    "reporting",
    "scheduling",
    "staff",
    "travel",
}
ALLOWED_PRIORITIES = {"low", "medium", "high", "urgent"}
ALLOWED_STATUSES = {"open", "in_progress", "resolved", "cancelled"}


def _required_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("A meaningful value is required.")
    return normalized


class OperationalFollowUpCreate(BaseModel):
    source_domain: str
    source_entity_type: str = Field(min_length=1, max_length=80)
    source_entity_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=4, max_length=160)
    priority: str = "medium"
    assignee_id: int | None = None
    due_date: date | None = None
    reason: str = Field(min_length=8, max_length=1000)

    @field_validator("source_domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in ALLOWED_DOMAINS:
            raise ValueError("Unsupported follow-up domain.")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in ALLOWED_PRIORITIES:
            raise ValueError("Unsupported priority.")
        return value

    @field_validator("source_entity_type", "source_entity_id", "title", "reason")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return _required_text(value)


class OperationalFollowUpUpdate(BaseModel):
    status: str
    version: int = Field(ge=1)
    assignee_id: int | None = None
    due_date: date | None = None
    priority: str | None = None
    reason: str = Field(min_length=8, max_length=1000)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in ALLOWED_STATUSES:
            raise ValueError("Unsupported follow-up status.")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        if value not in ALLOWED_PRIORITIES:
            raise ValueError("Unsupported priority.")
        return value

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return _required_text(value)


class OperationalFollowUpResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_domain: str
    source_entity_type: str
    source_entity_id: str
    title: str
    priority: str
    status: str
    assignee_id: int | None
    assignee_name: str | None = None
    due_date: date | None
    created_by: int
    creator_name: str | None = None
    created_reason: str
    resolution: str | None
    resolved_by: int | None
    resolver_name: str | None = None
    resolved_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime
    available_actions: list[str] = Field(default_factory=list)


class OperationalFollowUpPage(BaseModel):
    items: list[OperationalFollowUpResponse]
    total: int
    limit: int
    offset: int


class OperationalFollowUpAssignee(BaseModel):
    id: int
    name: str
