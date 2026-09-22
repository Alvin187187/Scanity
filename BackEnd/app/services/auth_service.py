import urllib.error
import urllib.request
import uuid

from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError
from supabase import create_client, Client

from app.core.config import settings
from app.models.schema import (
    HealthProfile,
    ScanHistory,
    User,
    user_allergies,
    user_health_conditions,
)
from app.services.password_rules import password_issue


supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def _auth_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def _auth_message(exc: Exception) -> str:
    return str(getattr(exc, "message", "") or exc)


def _raise_password_error(exc: Exception, password: str) -> None:
    message = _auth_message(exc)
    lowered = message.lower()
    own_issue = password_issue(password)
    if own_issue:
        raise AuthError(own_issue)
    if "same" in lowered and "password" in lowered:
        raise AuthError("Choose a password that is different from your current one.")
    if any(token in lowered for token in ("weak_password", "pwned", "easy to guess", "known to be weak")):
        raise AuthError(
            "That password is too easy to guess. Use 8 or more characters with at least 1 number."
        )
    if "password" in lowered and any(
        token in lowered for token in ("requirement", "should contain", "at least one character")
    ):
        raise AuthError(
            "Password must be at least 8 characters and include at least 1 number. "
            "Letters and other characters are allowed."
        )
    raise AuthError(message or "Password could not be updated")


class AuthError(Exception):
    """Raised on any Supabase Auth failure — invalid credentials, duplicate email, etc."""
    pass


class LocalUserSyncError(AuthError):
    """Supabase Auth succeeded but the local users row could not be saved."""
    pass


def register_user(db, full_name: str, email: str, password: str) -> dict:
    issue = password_issue(password)
    if issue:
        raise AuthError(issue)
    redirect = f"{settings.FRONTEND_URL.rstrip('/')}/"
    try:
        result = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {"full_name": full_name},
                "email_redirect_to": redirect,
            },
        })
    except Exception as exc:
        _raise_password_error(exc, password)

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

    confirmed = bool(
        getattr(result.user, "email_confirmed_at", None)
        or getattr(result.user, "confirmed_at", None)
        or result.session is not None
    )
    return {
        "user_id": str(local_user.user_id),
        "full_name": local_user.full_name,
        "email": local_user.email,
        "email_confirmed": confirmed,
    }


def login_user(email: str, password: str) -> dict:
    try:
        result = supabase.auth.sign_in_with_password({"email": email, "password": password})
    except Exception as exc:
        lowered = _auth_message(exc).lower()
        if "not confirmed" in lowered or "email_not_confirmed" in lowered:
            raise AuthError("Email not confirmed")
        raise AuthError("Invalid email or password")

    session = result.session
    if session is None:
        user = getattr(result, "user", None)
        if user is not None and not (
            getattr(user, "email_confirmed_at", None) or getattr(user, "confirmed_at", None)
        ):
            raise AuthError("Email not confirmed")
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


def _reset_redirect(origin: str | None) -> str:
    configured = settings.FRONTEND_URL.rstrip("/")
    allowed = {item.rstrip("/") for item in settings.cors_origin_list}
    allowed.add(configured)
    public = [
        item
        for item in allowed
        if "localhost" not in item and "127.0.0.1" not in item
    ]
    candidate = (origin or "").strip().rstrip("/")
    if candidate in allowed:
        return f"{candidate}/"
    fallback = public[0] if "localhost" in configured or "127.0.0.1" in configured else configured
    if not fallback and public:
        fallback = public[0]
    return f"{(fallback or configured).rstrip('/')}/"


def request_password_reset(email: str, redirect_origin: str | None = None) -> None:
    redirect = _reset_redirect(redirect_origin)
    try:
        supabase.auth.reset_password_for_email(
            email,
            {"redirect_to": redirect},
        )
    except Exception:
        try:
            supabase.auth.reset_password_email(email, {"redirect_to": redirect})
        except Exception:
            pass


def _reject_reused_password(email: str, new_password: str) -> None:
    probe = _auth_client()
    try:
        signed_in = probe.auth.sign_in_with_password(
            {"email": email, "password": new_password}
        )
    except Exception:
        return
    if getattr(signed_in, "session", None) is not None:
        raise AuthError("Choose a password that is different from your current one.")


def confirm_password_reset(
    new_password: str,
    reset_token: str = "",
    access_token: str = "",
    refresh_token: str = "",
) -> None:
    issue = password_issue(new_password)
    if issue:
        raise AuthError(issue)

    client = _auth_client()
    try:
        if access_token:
            client.auth.set_session(access_token, refresh_token or access_token)
            user_response = client.auth.get_user(access_token)
        elif reset_token:
            client.auth.verify_otp({"token_hash": reset_token, "type": "recovery"})
            user_response = client.auth.get_user()
        else:
            raise AuthError("Reset link is missing or expired. Request a new email.")

        email = getattr(getattr(user_response, "user", None), "email", None)
        if email:
            _reject_reused_password(email, new_password)
        client.auth.update_user({"password": new_password})
    except AuthError:
        raise
    except Exception as exc:
        _raise_password_error(exc, new_password)


def change_password(email: str, current_password: str, new_password: str) -> dict:
    issue = password_issue(new_password)
    if issue:
        raise AuthError(issue)
    if current_password == new_password:
        raise AuthError("Choose a password that is different from your current one.")

    client = _auth_client()
    try:
        signed_in = client.auth.sign_in_with_password(
            {"email": email, "password": current_password}
        )
    except Exception:
        raise AuthError("Current password is incorrect")

    session = getattr(signed_in, "session", None)
    if session is None:
        raise AuthError("Current password is incorrect")

    try:
        client.auth.set_session(session.access_token, session.refresh_token)
        client.auth.update_user({"password": new_password})
        refreshed = client.auth.sign_in_with_password(
            {"email": email, "password": new_password}
        )
    except AuthError:
        raise
    except Exception as exc:
        _raise_password_error(exc, new_password)

    next_session = getattr(refreshed, "session", None)
    if next_session is None:
        raise AuthError("Password could not be updated")
    return {
        "access_token": next_session.access_token,
        "refresh_token": next_session.refresh_token,
        "expires_in": next_session.expires_in,
    }


def delete_auth_user(access_token: str) -> None:
    url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user"
    request = urllib.request.Request(
        url,
        method="DELETE",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.SUPABASE_KEY,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status not in (200, 204):
                raise AuthError("Account could not be deleted")
    except urllib.error.HTTPError as exc:
        if exc.code not in (200, 204):
            raise AuthError("Account could not be deleted")
    except AuthError:
        raise
    except Exception:
        raise AuthError("Account could not be deleted")


def delete_local_user(db, user_id: str) -> None:
    uid = uuid.UUID(str(user_id))
    db.execute(delete(user_allergies).where(user_allergies.c.user_id == uid))
    db.execute(
        delete(user_health_conditions).where(user_health_conditions.c.user_id == uid)
    )
    db.execute(delete(ScanHistory).where(ScanHistory.user_id == uid))
    db.execute(delete(HealthProfile).where(HealthProfile.user_id == uid))
    db.execute(delete(User).where(User.user_id == uid))
    db.commit()
