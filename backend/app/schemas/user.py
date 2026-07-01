from pydantic import BaseModel, EmailStr, Field, field_validator



class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    role: str  # e.g., 'employee', 'manager'

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TherapistResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class TherapistUpdate(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    email: EmailStr
    is_active: bool
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Therapist name must contain at least 2 characters")
        return normalized
