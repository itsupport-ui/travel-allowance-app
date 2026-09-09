from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

OPERATIONS_STAFF_ROLES = {"telecaller", "clinical_head"}



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
    permissions: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)


class TherapistUpdate(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    email: EmailStr
    is_active: bool
    password: str | None = Field(default=None, min_length=8, max_length=128)
    deactivation_reason: str | None = Field(default=None, max_length=500)
    override_request_id: int | None = Field(default=None, ge=1)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Therapist name must contain at least 2 characters")
        return normalized


class OperationsStaffResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    permissions: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class OperationsStaffCreate(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Name must contain at least 2 characters")
        return normalized

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in OPERATIONS_STAFF_ROLES:
            raise ValueError(
                "Role must be one of: "
                + ", ".join(sorted(OPERATIONS_STAFF_ROLES))
            )
        return normalized


class OperationsStaffUpdate(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    email: EmailStr
    role: str
    is_active: bool

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Name must contain at least 2 characters")
        return normalized

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in OPERATIONS_STAFF_ROLES:
            raise ValueError(
                "Role must be one of: "
                + ", ".join(sorted(OPERATIONS_STAFF_ROLES))
            )
        return normalized


class OperationsStaffPasswordReset(BaseModel):
    password: str = Field(min_length=8, max_length=128)
