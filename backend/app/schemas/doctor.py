from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime


class DoctorUserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError(
                "Doctor username must contain at least 2 characters"
            )
        return normalized


class DoctorCreate(BaseModel):
    user_id: int = Field(gt=0)
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
    user_id: int = Field(gt=0)
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
    user_id: int
    name: str
    specialization: str | None = None
    phone: str | None = None
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True
