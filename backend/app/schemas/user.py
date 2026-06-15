from pydantic import BaseModel


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
