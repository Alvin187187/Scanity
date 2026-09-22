from pydantic import BaseModel, EmailStr
from typing import Optional


class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class RegisterResponse(BaseModel):
    user_id: str
    full_name: str
    email: EmailStr
    email_confirmed: bool = True
    # Never includes password or password hash


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    expires_in: int


class PasswordResetRequest(BaseModel):
    email: EmailStr
    redirect_origin: Optional[str] = None


class PasswordResetConfirm(BaseModel):
    reset_token: str = ""
    access_token: str = ""
    refresh_token: str = ""
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class MessageResponse(BaseModel):
    message: str