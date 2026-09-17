import uuid

from sqlalchemy.exc import SQLAlchemyError
from supabase import create_client, Client

from app.core.config import settings
from app.models.schema import User


supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


class AuthError(Exception):
    """Raised on any Supabase Auth failure — invalid credentials, duplicate email, etc."""
    pass


class LocalUserSyncError(AuthError):
    """Supabase Auth succeeded but the local users row could not be saved."""
    pass


def register_user(db, full_name: str, email: str, password: str) -> dict:
    try:
        result = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {"data": {"full_name": full_name}},
        })
    except Exception:
        raise AuthError("Registration failed")

    if result.user is None:
        raise AuthError("Registration failed")

    try:
        local_user = User(
            user_id=uuid.UUID(result.user.id),
            full_name=full_name,
            email=result.user.email,
        )
        db.add(local_user)
        db.commit()
        db.refresh(local_user)
    except SQLAlchemyError:
        db.rollback()
        raise LocalUserSyncError(
            "Account was created but the local user profile could not be saved."
        )

    return {
        "user_id": str(local_user.user_id),
        "full_name": local_user.full_name,
        "email": local_user.email,
    }


def login_user(email: str, password: str) -> dict:
    try:
        result = supabase.auth.sign_in_with_password({"email": email, "password": password})
    except Exception:
        raise AuthError("Invalid email or password")

    session = result.session
    if session is None:
        raise AuthError("Invalid email or password")

    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
    }


def refresh_token(refresh_token_value: str) -> dict:
    try:
        result = supabase.auth.refresh_session(refresh_token_value)
    except Exception:
        raise AuthError("Refresh token invalid or expired")

    session = result.session
    if session is None:
        raise AuthError("Refresh token invalid or expired")

    return {
        "access_token": session.access_token,
        "expires_in": session.expires_in,
    }


def logout_user(access_token: str) -> None:
    try:
        supabase.auth.set_session(access_token, access_token)
        supabase.auth.sign_out()
    except Exception as e:
        raise AuthError(str(e))


def request_password_reset(email: str) -> None:
    try:
        supabase.auth.reset_password_email(email)
    except Exception:
        pass


def confirm_password_reset(reset_token: str, new_password: str) -> None:
    try:
        supabase.auth.verify_otp({"token_hash": reset_token, "type": "recovery"})
        supabase.auth.update_user({"password": new_password})
    except Exception:
        raise AuthError("Invalid or expired reset token")
