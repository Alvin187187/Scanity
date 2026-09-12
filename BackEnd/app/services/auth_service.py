# app/services/auth_service.py
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


def register_user(db, full_name: str, email: str, password: str) -> dict:
    from app.models.user import User

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

    # Create the matching local users row — user_id stays local/int (Option B),
    # auth_uid links back to the Supabase Auth account. No password stored here.
    local_user = User(
        auth_uid=result.user.id,
        full_name=full_name,
        email=result.user.email,
    )
    db.add(local_user)
    db.commit()
    db.refresh(local_user)

    return {
        "user_id": local_user.user_id,
        "full_name": local_user.full_name,
        "email": local_user.email,
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
    """
    Signs out the session associated with the given access token.
    Note: supabase-py's sign_out() operates on the client's current session
    state, not an arbitrary passed-in token — in a stateless multi-request
    API, this only works correctly if the client is set to use this token's
    session first. Worth flagging to whoever reviews this: for a fully
    stateless server, invalidating a specific token may require calling
    Supabase's admin API directly rather than the client SDK's sign_out().
    """
    try:
        supabase.auth.set_session(access_token, access_token)
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