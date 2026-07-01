from pydantic import BaseModel, Field, field_validator
from datetime import datetime

class DoctorCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    specialization: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=24)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Doctor name must contain at least 2 characters")
        return normalized


class DoctorUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    specialization: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=24)
    active: bool

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Doctor name must contain at least 2 characters")
        return normalized

class DoctorResponse(BaseModel):
    id: int
    name: str
    specialization: str | None = None
    phone: str | None = None
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True
