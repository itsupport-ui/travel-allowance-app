import math
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SettingsBase(BaseModel):
    per_km_rate: float = Field(ge=0, allow_inf_nan=False)
    daily_allowance: float = Field(ge=0, allow_inf_nan=False)
    doctor_receipt_threshold: float | None = Field(
        default=None, ge=0, allow_inf_nan=False
    )
    effective_from: date | None = None

    @field_validator(
        "per_km_rate", "daily_allowance", "doctor_receipt_threshold"
    )
    @classmethod
    def validate_currency_precision(cls, value: float) -> float:
        if value is None:
            return value
        if not math.isfinite(value):
            raise ValueError("Value must be a finite number")

        decimal_value = Decimal(str(value))
        if decimal_value.as_tuple().exponent < -2:
            raise ValueError("Value must have at most two decimal places")

        return value

class SettingsResponse(SettingsBase):
    doctor_receipt_threshold: float
    id: int
    version: int
    effective_to: date | None = None
    rounding_mode: str

    model_config = ConfigDict(from_attributes=True)
