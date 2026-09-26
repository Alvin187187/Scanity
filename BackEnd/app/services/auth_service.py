import urllib.error
import urllib.request
import uuid

from sqlalchemy import delete, text
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


_user_columns_widened = False


def _ensure_user_columns(db) -> None:
    """Live Postgres still has varchar(35) email / varchar(25) name until migrated."""
    global _user_columns_widened
    if _user_columns_widened:
        return
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        _user_columns_widened = True
        return
    try:
        db.execute(text("ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255)"))
        db.execute(text("ALTER TABLE users ALTER COLUMN full_name TYPE VARCHAR(120)"))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
    _user_columns_widened = True


def register_user(db, full_name: str, email: str, password: str) -> dict:
    issue = password_issue(password)
    if issue:
        raise AuthError(issue)
    redirect = _public_app_url()
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

    confirmed = bool(
        getattr(result.user, "email_confirmed_at", None)
        or getattr(result.user, "confirmed_at", None)
        or result.session is not None
    )
    user_id = uuid.UUID(result.user.id)
    stored_email = (result.user.email or email or "").strip()[:255]
    stored_name = (full_name or "").strip()[:120] or None
    _ensure_user_columns(db)

    existing = db.query(User).filter(User.user_id == user_id).one_or_none()
    if existing is not None:
        return {
            "user_id": str(existing.user_id),
            "full_name": existing.full_name,
            "email": existing.email,
            "email_confirmed": confirmed,
        }

    try:
        local_user = User(
            user_id=user_id,
            full_name=stored_name,
            email=stored_email,
        )
        db.add(local_user)
        db.commit()
        db.refresh(local_user)
    except SQLAlchemyError:
        db.rollback()
        existing = db.query(User).filter(User.user_id == user_id).one_or_none()
        if existing is None:
            raise LocalUserSyncError(
                "Account was created but the local user profile could not be saved."
            )
        local_user = existing

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


PUBLIC_APP_URL = "https://scanity-eta.vercel.app"


def _public_app_url(origin: str | None = None) -> str:
    """Reset and confirmation emails must open the hosted app.

    A localhost redirect is only useful on the machine that sent the email.
    Supabase then drops the person on localhost when they open the link.
    """
    candidate = (origin or "").strip().rstrip("/")
    if candidate.startswith("https://") and (
        candidate == PUBLIC_APP_URL or candidate.endswith(".vercel.app")
    ):
        return f"{candidate}/"
    configured = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if (
        configured.startswith("https://")
        and "localhost" not in configured
        and "127.0.0.1" not in configured
    ):
        return f"{configured}/"
    return f"{PUBLIC_APP_URL}/"


def _reset_redirect(origin: str | None) -> str:
    return _public_app_url(origin)


def request_password_reset(email: str, redirect_origin: str | None = None) -> None:
    """Ask Supabase Auth to email a recovery link. Unknown emails stay silent."""
    redirect = _reset_redirect(redirect_origin)
    options = {"redirect_to": redirect}
    last_error: Exception | None = None
    for sender in (
        lambda: supabase.auth.reset_password_for_email(email, options),
        lambda: supabase.auth.reset_password_email(email, options),
    ):
        try:
            sender()
            return
        except Exception as exc:
            last_error = exc
    message = _auth_message(last_error) if last_error else ""
    lowered = message.lower()
    if any(token in lowered for token in ("user not found", "not found", "no user")):
        return
    raise AuthError("We could not send the reset email. Wait a moment and try again.")


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
