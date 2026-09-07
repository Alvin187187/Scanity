"""
Thin wrapper around Supabase Auth. Per the team's decision, Supabase Auth owns
registration, login, refresh, and password reset entirely — this service never
hashes or stores a password itself, it just forwards calls and maps errors.
"""
from supabase import create_client, Client
from app.core.config import settings

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


class AuthError(Exception):
    """Raised on any Supabase Auth failure — invalid credentials, duplicate email, etc."""
    pass


def register_user(full_name: str, email: str, password: str) -> dict:
    try:
        result = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {"data": {"full_name": full_name}},
        })
    except Exception as e:
        raise AuthError(str(e))

    if result.user is None:
        raise AuthError("Registration failed")

    return {
        "user_id": result.user.id,
        "full_name": full_name,
        "email": result.user.email,
    }


def login_user(email: str, password: str) -> dict:
    try:
        result = supabase.auth.sign_in_with_password({"email": email, "password": password})
    except Exception:
        # Supabase raises a generic auth error on bad credentials —
        # never leak whether the email exists or the password was wrong
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
        supabase.auth.sign_out()
    except Exception as e:
        raise AuthError(str(e))


def request_password_reset(email: str) -> None:
    try:
        supabase.auth.reset_password_email(email)
    except Exception:
        # Deliberately swallow errors here too — response must not reveal
        # whether the email exists, per the API contract's design
        pass


def confirm_password_reset(reset_token: str, new_password: str) -> None:
    try:
        supabase.auth.verify_otp({"token_hash": reset_token, "type": "recovery"})
        supabase.auth.update_user({"password": new_password})
    except Exception as e:
        raise AuthError("Invalid or expired reset token")
