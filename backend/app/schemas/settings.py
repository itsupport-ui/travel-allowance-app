import math
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class SettingsBase(BaseModel):
    per_km_rate: float = Field(ge=0, allow_inf_nan=False)
    daily_allowance: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("per_km_rate", "daily_allowance")
    @classmethod
    def validate_currency_precision(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Value must be a finite number")

        decimal_value = Decimal(str(value))
        if decimal_value.as_tuple().exponent < -2:
            raise ValueError("Value must have at most two decimal places")

        return value

class SettingsResponse(SettingsBase):
    id: int

    class Config:
        from_attributes = True
