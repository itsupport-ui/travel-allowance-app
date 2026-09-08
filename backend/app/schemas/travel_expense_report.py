from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PersonType = Literal["therapist", "doctor"]


class TravelExpenseReportRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    patient_name: str
    from_address: str
    to_address: str
    km: float
    fare: float
    daily_allowance: float
    others: float
    total: float


class TravelExpensePersonGroup(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    person_id: int
    person_name: str
    rows: list[TravelExpenseReportRow]
    total_km: float
    total_fare: float
    total_daily_allowance: float
    total_others: float
    grand_total: float


class TravelExpenseReportResponse(BaseModel):
    heading: str
    person_type: PersonType
    scope: Literal["individual", "all"]
    person_id: int | None = None
    person_name: str | None = None
    period_label: str
    start_date: date
    end_date: date
    groups: list[TravelExpensePersonGroup]
    total_km: float
    total_fare: float
    total_daily_allowance: float
    total_others: float
    grand_total: float
    row_count: int
    generated_at: datetime
    warnings: list[str] = Field(default_factory=list)
