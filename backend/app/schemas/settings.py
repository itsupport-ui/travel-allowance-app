from pydantic import BaseModel


class SettingsBase(BaseModel):
    per_km_rate: float
    daily_allowance: float

class SettingsResponse(SettingsBase):
    id: int

    class Config:
        from_attributes = True