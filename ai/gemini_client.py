"""
ai/gemini_client.py

Hosted Gemini explanation wrapper. Gemini never decides avoid/caution/safe.
Supports:
  - Google AI Studio keys (AIza...) via generativelanguage.googleapis.com
  - OpenRouter keys (sk-or-...) via openrouter.ai with google/gemini-* models

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

DEFAULT_MODEL = "gemini-3.1-flash-lite"
GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_SECONDS = 20
CHIP_TIMEOUT_SECONDS = 7
FALLBACK_TEXT = (
    "Safety score and allergy signals above still apply. "
    "Confirm the package label if anything looks incomplete."
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
    try:
        from app.core.config import settings

        settings_key = str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()
        current_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if settings_key and not settings_key.startswith("YOUR_") and (
            not current_key or current_key.startswith("YOUR_")
        ):
            os.environ["GEMINI_API_KEY"] = settings_key
        if getattr(settings, "GEMINI_MODEL", None) and not os.environ.get("GEMINI_MODEL"):
            os.environ["GEMINI_MODEL"] = str(settings.GEMINI_MODEL)
        if getattr(settings, "AI_PROVIDER", None) and not os.environ.get("AI_PROVIDER"):
            os.environ["AI_PROVIDER"] = str(settings.AI_PROVIDER)
    except Exception:
        pass


def _detect_provider(api_key: str) -> str:
    forced = (os.environ.get("AI_PROVIDER") or "").strip().lower()
    if forced in {"google", "openrouter"}:
        return forced
    if api_key.startswith("sk-or-"):
        return "openrouter"
    if api_key.startswith("AIza"):
        return "google"
    return "google"


def _normalize_openrouter_model(model: str) -> str:
    name = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if name.startswith("google/") or "/" in name:
        return name
    return f"google/{name}"


def _gemini_settings() -> tuple[str, str, str]:
    _load_local_env()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key.startswith("YOUR_"):
        api_key = ""
    model = (os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    provider = _detect_provider(api_key) if api_key else "none"
    return api_key, model, provider


def _extract_google_text(data: dict) -> str:
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
    visible = [
        part.get("text", "")
        for part in parts
        if isinstance(part, dict) and part.get("text") and not part.get("thought")
    ]
    return "".join(visible).strip()


def _extract_openrouter_text(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        chunks: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                chunks.append(str(part.get("text") or ""))
            elif isinstance(part, str):
                chunks.append(part)
        return "".join(chunks).strip()
    return ""


def _call_google(api_key: str, model: str, prompt: str, system_instructions: str, max_output_tokens: int, temperature: float, timeout: float) -> str:
    url = GOOGLE_ENDPOINT.format(model=model)
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    payload = {
        "systemInstruction": {"parts": [{"text": system_instructions}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }
    response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if response.status_code != 200:
        _set_status("template", f"google_http_{response.status_code}")
        logger.warning("Gemini Google HTTP %s", response.status_code)
        return ""
    try:
        return _extract_google_text(response.json())
    except (TypeError, ValueError, AttributeError):
        _set_status("template", "google_bad_json")
        return ""


def _call_openrouter(api_key: str, model: str, prompt: str, system_instructions: str, max_output_tokens: int, temperature: float, timeout: float) -> str:
    routed_model = _normalize_openrouter_model(model)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "https://scanity.app"),
        "X-Title": os.environ.get("OPENROUTER_TITLE", "Scanity"),
    }
    payload = {
        "model": routed_model,
        "messages": [
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }
    response = requests.post(
        OPENROUTER_ENDPOINT,
        headers=headers,
        json=payload,
        timeout=timeout,
    )
    if response.status_code != 200:
        _set_status("template", f"openrouter_http_{response.status_code}")
        logger.warning("OpenRouter HTTP %s", response.status_code)
        return ""
    try:
        return _extract_openrouter_text(response.json())
    except (TypeError, ValueError, AttributeError):
        _set_status("template", "openrouter_bad_json")
        return ""


def call_hosted_ai(
    prompt: str,
    *,
    system_instructions: str | None = None,
    max_output_tokens: int = 512,
    temperature: float = 0.35,
    timeout_seconds: float | None = None,
) -> str:
    """
    Send a prompt to hosted Gemini (Google or OpenRouter) and return plain text.

    Reads GEMINI_API_KEY / GEMINI_MODEL on every call. The API key is never logged.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        _set_status("template", "empty_prompt")
        return FALLBACK_TEXT

    api_key, model, provider = _gemini_settings()
    if not api_key or api_key.startswith("YOUR_"):
        _set_status("template", "missing_api_key")
        logger.warning("Gemini skipped: GEMINI_API_KEY is missing on this server.")
        return FALLBACK_TEXT

    system = system_instructions or SYSTEM_INSTRUCTIONS
    timeout = float(timeout_seconds) if timeout_seconds is not None else float(TIMEOUT_SECONDS)
    try:
        if provider == "openrouter":
            text = _call_openrouter(api_key, model, prompt, system, max_output_tokens, temperature, timeout)
            if text:
                _set_status("gemini", f"openrouter:{_normalize_openrouter_model(model)}")
                return text
            return FALLBACK_TEXT

        text = _call_google(api_key, model, prompt, system, max_output_tokens, temperature, timeout)
        if text:
            _set_status("gemini", f"google:{model}")
            return text
        return FALLBACK_TEXT
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, requests.exceptions.RequestException) as exc:
        _set_status("template", f"network:{type(exc).__name__}")
        logger.warning("Gemini network error: %s", type(exc).__name__)
        return FALLBACK_TEXT


if __name__ == "__main__":
    print(call_hosted_ai("Say hello in one short sentence with **bold** and one bullet list."))
    print(last_ai_status())
