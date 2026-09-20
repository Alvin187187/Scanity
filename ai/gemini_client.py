"""
ai/gemini_client.py

Hosted Gemini explanation wrapper. Gemini never decides avoid/caution/safe.
This function never raises. It returns model text or FALLBACK_TEXT.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import requests

from ai.prompt import SYSTEM_INSTRUCTIONS

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV_PATH = REPO_ROOT / "BackEnd" / ".env"
ROOT_ENV_PATH = REPO_ROOT / ".env"

DEFAULT_MODEL = "gemini-2.0-flash"
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SECONDS = 20
FALLBACK_TEXT = (
    "We couldn't generate a live AI explanation right now, but the safety score "
    "and CSV ingredient checks above are still valid."
)

logger = logging.getLogger(__name__)
_LAST_STATUS: dict[str, str] = {"source": "unset", "detail": ""}


def last_ai_status() -> dict[str, str]:
    return dict(_LAST_STATUS)


def _set_status(source: str, detail: str = "") -> None:
    _LAST_STATUS["source"] = source
    _LAST_STATUS["detail"] = detail


def _apply_env_file(path: Path) -> None:
    """Load KEY=VALUE lines without overriding a value already in the process."""
    if not path.is_file():
        return
    text = path.read_text(encoding="utf-8-sig")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key.removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _load_local_env() -> None:
    _apply_env_file(BACKEND_ENV_PATH)
    _apply_env_file(ROOT_ENV_PATH)
    # FastAPI settings may already have loaded the key.
    try:
        from app.core.config import settings

        if getattr(settings, "GEMINI_API_KEY", None) and "GEMINI_API_KEY" not in os.environ:
            os.environ["GEMINI_API_KEY"] = str(settings.GEMINI_API_KEY)
        if getattr(settings, "GEMINI_MODEL", None) and not os.environ.get("GEMINI_MODEL"):
            os.environ["GEMINI_MODEL"] = str(settings.GEMINI_MODEL)
    except Exception:
        pass


def _gemini_settings() -> tuple[str, str]:
    _load_local_env()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key.startswith("YOUR_"):
        api_key = ""
    model = (os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    return api_key, model


def _extract_text(data: dict) -> str:
    prompt_feedback = data.get("promptFeedback") or {}
    if prompt_feedback.get("blockReason"):
        return ""

    candidates = data.get("candidates") or []
    if not candidates:
        return ""

    first = candidates[0]
    finish_reason = str(first.get("finishReason") or "")
    if finish_reason in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"}:
        return ""

    parts = ((first.get("content") or {}).get("parts")) or []
    return "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()


def call_hosted_ai(
    prompt: str,
    *,
    system_instructions: str | None = None,
    max_output_tokens: int = 512,
    temperature: float = 0.35,
) -> str:
    """
    Send a prompt to hosted Gemini and return plain text.

    Reads GEMINI_API_KEY / GEMINI_MODEL on every call. The API key is never logged.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        _set_status("template", "empty_prompt")
        return FALLBACK_TEXT

    api_key, model = _gemini_settings()
    if not api_key or api_key.startswith("YOUR_"):
        _set_status("template", "missing_api_key")
        logger.warning("Gemini skipped: GEMINI_API_KEY is missing on this server.")
        return FALLBACK_TEXT

    url = GEMINI_ENDPOINT.format(model=model)
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    payload = {
        "systemInstruction": {
            "parts": [{"text": system_instructions or SYSTEM_INSTRUCTIONS}]
        },
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }

    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, requests.exceptions.RequestException) as exc:
        _set_status("template", f"network:{type(exc).__name__}")
        logger.warning("Gemini network error: %s", type(exc).__name__)
        return FALLBACK_TEXT

    if response.status_code != 200:
        _set_status("template", f"http_{response.status_code}")
        logger.warning("Gemini HTTP %s", response.status_code)
        return FALLBACK_TEXT

    try:
        text = _extract_text(response.json())
    except (TypeError, ValueError, AttributeError):
        _set_status("template", "bad_json")
        return FALLBACK_TEXT

    if not text:
        _set_status("template", "empty_model_text")
        return FALLBACK_TEXT

    _set_status("gemini", model)
    return text


if __name__ == "__main__":
    print(call_hosted_ai("Say hello in one short sentence with **bold** and one bullet list."))
