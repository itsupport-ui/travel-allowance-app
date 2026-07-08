# create Authentication router for user registration and login, and token generation
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserResponse, LoginRequest, LoginResponse
from passlib.context import CryptContext
from datetime import datetime, timedelta
from app.utils.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)
from app.utils.permissions import get_role_permissions
from jose import JWTError, jwt  
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.security import OAuth2PasswordBearer

# The tokenUrl must match your login endpoint path exactly
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

@router.post("/register", response_model=UserResponse)
def register(
    user: UserRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"])),
):
    requested_role = user.role.strip().lower()
    if requested_role not in {"admin", "doctor", "therapist"}:
        raise HTTPException(
            status_code=400,
            detail="Unsupported user role",
        )
    if requested_role in {"admin", "doctor"}:
        raise HTTPException(
            status_code=403,
            detail=(
                "Admin and doctor users must be created "
                "by an administrator"
            ),
        )

    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = hash_password(user.password)
    user = User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        role=requested_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=LoginResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Authenticate user using email and password
    user = db.query(User).filter(User.email == form_data.username).first()
    if (
        not user
        or not verify_password(form_data.password, user.password_hash)
        or not user.is_active
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token(data={"sub": str(user.id)})
    return LoginResponse(access_token=access_token, token_type="bearer")
    

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "permissions": sorted(
            get_role_permissions(current_user.role)
        ),
    }

