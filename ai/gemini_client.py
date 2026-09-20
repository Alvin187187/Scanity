"""
ai/gemini_client.py

Ticket: #168

call_hosted_ai(prompt) -> str

Hosted Gemini explanation wrapper. Gemini never decides avoid/caution/safe.
This function never raises. It returns model text or FALLBACK_TEXT.

Backend handoff
---------------
Function: call_hosted_ai
Path:     ai/gemini_client.py
Input:    prompt: str  (build it with ai.prompt.build_prompt)
Output:   str          (1-2 sentences, or FALLBACK_TEXT)

Copy-paste example (from the repository root, with GEMINI_API_KEY set
in BackEnd/.env or the process environment):

    from ai.prompt import build_prompt
    from ai.gemini_client import call_hosted_ai

    prompt = build_prompt(
        "sodium caseinate",
        "Matches Milk allergen category (Avoid)",
        "Milk allergy",
    )
    print(call_hosted_ai(prompt))
"""

from __future__ import annotations

import os
from pathlib import Path

import requests

from ai.prompt import SYSTEM_INSTRUCTIONS

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV_PATH = REPO_ROOT / "BackEnd" / ".env"
ROOT_ENV_PATH = REPO_ROOT / ".env"

DEFAULT_MODEL = "gemini-3.1-flash-lite"
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SECONDS = 15
FALLBACK_TEXT = (
    "We couldn't generate an explanation right now, but the safety result above is accurate."
)


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
        if not key or key.startswith("export "):
            key = key.removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _load_local_env() -> None:
    # App keys live in BackEnd/.env. A root .env is accepted for local AI scripts.
    _apply_env_file(BACKEND_ENV_PATH)
    _apply_env_file(ROOT_ENV_PATH)


def _gemini_settings() -> tuple[str, str]:
    _load_local_env()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if api_key.startswith("YOUR_"):
        api_key = ""
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
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
    max_output_tokens: int = 160,
    temperature: float = 0.2,
) -> str:
    """
    Send a prompt to hosted Gemini and return plain text.

    Reads GEMINI_API_KEY / GEMINI_MODEL on every call so Backend can load
    dotenv before or after importing this module. The API key is never logged.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        return FALLBACK_TEXT

    api_key, model = _gemini_settings()
    if not api_key or api_key.startswith("YOUR_"):
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
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, requests.exceptions.RequestException):
        return FALLBACK_TEXT

    if response.status_code != 200:
        return FALLBACK_TEXT

    try:
        text = _extract_text(response.json())
    except (TypeError, ValueError, AttributeError):
        return FALLBACK_TEXT

    return text or FALLBACK_TEXT


if __name__ == "__main__":
    # Manual sanity check: python -m ai.gemini_client
    print(call_hosted_ai("Say hello in one sentence."))
