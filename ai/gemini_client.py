"""
ai/gemini_client.py

Ticket: Gemini hosted AI wrapper (SVheinr)

One function: call_hosted_ai(prompt) -> str
Never raises. Always returns a string - either the real model output or a safe
fallback sentence.
"""
import os
import requests

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

TIMEOUT_SECONDS = 8
FALLBACK_TEXT = "We couldn't generate an explanation right now, but the safety result above is accurate."


def call_hosted_ai(prompt: str) -> str:
    """
    Send a prompt to the hosted Gemini model and return plain text.

    Args:
        prompt: the full prompt string (system instructions + structured input
                already combined by the caller).

    Returns:
        str: the model's text response, or FALLBACK_TEXT on any failure.
        This function never raises - every error path returns the fallback
        string instead of crashing the caller.
    """
    if not GEMINI_API_KEY:
        return FALLBACK_TEXT

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
    }
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}

    try:
        response = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
    except requests.exceptions.Timeout:
        return FALLBACK_TEXT
    except requests.exceptions.ConnectionError:
        return FALLBACK_TEXT
    except requests.exceptions.RequestException:
        return FALLBACK_TEXT

    if response.status_code == 401:
        return FALLBACK_TEXT
    if response.status_code == 429:
        return FALLBACK_TEXT
    if response.status_code >= 500:
        return FALLBACK_TEXT
    if response.status_code != 200:
        return FALLBACK_TEXT

    try:
        data = response.json()
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p["text"] for p in parts if "text" in p).strip()
        return text if text else FALLBACK_TEXT
    except (KeyError, IndexError, ValueError):
        return FALLBACK_TEXT


if __name__ == "__main__":
    # Manual sanity check: python ai/gemini_client.py
    print(call_hosted_ai("Say hello in one sentence."))