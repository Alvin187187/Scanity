# app/routers/auth.py
from fastapi import APIRouter, HTTPException, Depends

from app.schemas.auth import (
    RegisterRequest, RegisterResponse,
    LoginRequest, TokenResponse,
    RefreshRequest, RefreshResponse,
    PasswordResetRequest, PasswordResetConfirm, MessageResponse,
)
from app.services.auth_service import (
    register_user, login_user, refresh_token, logout_user,
    request_password_reset, confirm_password_reset, AuthError,
)
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/auth")


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(request: RegisterRequest):
    try:
        result = register_user(request.full_name, request.email, request.password)
    except AuthError as e:
        # Supabase distinguishes duplicate-email internally; surfaced generically
        # here since AuthError doesn't carry a status code — refine if Supabase's
        # error object exposes a specific "already registered" type
        raise HTTPException(status_code=409, detail=str(e))
    return RegisterResponse(**result)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    try:
        result = login_user(request.email, request.password)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return TokenResponse(**result)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(request: RefreshRequest):
    try:
        result = refresh_token(request.refresh_token)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return RefreshResponse(**result)


@router.post("/logout", status_code=204)
async def logout(current_user: dict = Depends(get_current_user)):
    logout_user(current_user)
    return None


@router.post("/password-reset/request", response_model=MessageResponse)
async def password_reset_request(request: PasswordResetRequest):
    request_password_reset(request.email)
    # Always the same response, regardless of whether the email exists —
    # per the API contract's deliberate non-revealing design
    return MessageResponse(message="If the email exists, a reset link was sent")


@router.post("/password-reset/confirm", response_model=MessageResponse)
async def password_reset_confirm(request: PasswordResetConfirm):
    try:
        confirm_password_reset(request.reset_token, request.new_password)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return MessageResponse(message="Password updated")
