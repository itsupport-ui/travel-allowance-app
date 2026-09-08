from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


StaffRole = Literal["therapist", "doctor"]
OverrideStatus = Literal[
    "pending",
    "approved",
    "rejected",
    "consumed",
    "expired",
    "stale",
]


class StaffDeactivationCondition(BaseModel):
    code: str
    count: int = Field(ge=0)
    message: str


class StaffDeactivationReadiness(BaseModel):
    staff_role: StaffRole
    staff_id: int
    current_state: Literal["active", "inactive"]
    readiness_state: Literal[
        "already_inactive",
        "ready",
        "hard_blocked",
        "override_required",
    ]
    business_date: date
    captured_at: datetime
    condition_fingerprint: str
    hard_blockers: list[StaffDeactivationCondition] = Field(default_factory=list)
    operational_impacts: list[StaffDeactivationCondition] = Field(
        default_factory=list
    )
    available_actions: list[str] = Field(default_factory=list)
    next_action: str | None = None


class StaffDeactivationOverrideCreate(BaseModel):
    staff_role: StaffRole
    staff_id: int = Field(ge=1)
    reason: str = Field(min_length=10, max_length=500)
    evidence_refs: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("evidence_refs")
    @classmethod
    def validate_evidence_refs(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            item = value.strip()
            if not item:
                continue
            if len(item) > 160:
                raise ValueError("Evidence references must be 160 characters or fewer")
            normalized.append(item)
        return list(dict.fromkeys(normalized))


class StaffDeactivationOverrideDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str = Field(min_length=5, max_length=500)
    version: int = Field(ge=1)


class StaffDeactivationOverrideResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_code: str
    subject_role: StaffRole
    subject_id: int
    requested_by: int
    request_reason: str
    evidence_refs: list[str] = Field(default_factory=list)
    captured_conditions: dict[str, object]
    condition_fingerprint: str
    before_state: dict[str, object]
    after_state: dict[str, object] | None = None
    status: OverrideStatus
    decided_by: int | None = None
    decision_reason: str | None = None
    decided_at: datetime | None = None
    expires_at: datetime
    consumed_by: int | None = None
    consumed_at: datetime | None = None
    version: int
    created_at: datetime
    available_actions: list[str] = Field(default_factory=list)
