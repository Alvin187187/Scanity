"""Turn a rule-engine result into a short shopper explanation.

Gemini is the hosted explainer. Local Ollama (phi4-mini) is an optional
fallback when GEMINI_API_KEY is missing or the hosted call fails. The model
never decides Safe / Caution / Avoid.
"""

from __future__ import annotations

import logging
import os

import requests

from app.core.repo_path import ensure_repo_root

ensure_repo_root()

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai
from ai.prompt import SYSTEM_INSTRUCTIONS, build_explainer_prompt

logger = logging.getLogger(__name__)

OLLAMA_TIMEOUT_SECONDS = 8
DEFAULT_OLLAMA_MODEL = "phi4-mini"


def _template_explanation(allergy_result: dict, nutrition_result: dict | None, verdict: str) -> str:
    label = (verdict or "Caution").capitalize()
    flagged = [
        item
        for item in (allergy_result.get("flagged_ingredients") or [])
        if str(item.get("status", "")).lower() in {"avoid", "caution"}
    ]
    if flagged:
        names = ", ".join(
            str(item.get("ingredient") or item.get("matched_kb_entry") or "an ingredient")
            for item in flagged[:3]
        )
        why = "matches your saved allergy profile" if label == "Avoid" else "could not be fully confirmed against your profile"
        sentence = f"{label}. Flagged for {names}, which {why}."
    elif label == "Safe":
        sentence = "Safe. No ingredients on this label matched your saved allergies."
    else:
        sentence = f"{label}. Some ingredients could not be matched, so this result is not confirmed safe."

    grade = (nutrition_result or {}).get("grade") if nutrition_result else None
    if grade:
        sentence = f"{sentence} Nutri-Score {str(grade).upper()} is shown separately and does not change that result."
    return sentence


def _call_ollama(prompt: str) -> str:
    host = (os.environ.get("OLLAMA_HOST") or "").strip().rstrip("/")
    if not host or host.startswith("YOUR_"):
        return ""
    model = (os.environ.get("OLLAMA_MODEL") or DEFAULT_OLLAMA_MODEL).strip() or DEFAULT_OLLAMA_MODEL
    try:
        response = requests.post(
            f"{host}/api/chat",
            json={
                "model": model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": SYSTEM_INSTRUCTIONS},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return ""
    if response.status_code != 200:
        return ""
    try:
        data = response.json()
    except ValueError:
        return ""
    message = data.get("message") or {}
    text = (message.get("content") or data.get("response") or "").strip()
    return text


def explain_scan(allergy_result: dict, nutrition_result: dict | None, verdict: str) -> str:
    prompt = build_explainer_prompt(allergy_result, nutrition_result, verdict)
    text = call_hosted_ai(prompt)
    if text and text != FALLBACK_TEXT:
        return text

    ollama_text = _call_ollama(prompt)
    if ollama_text:
        return ollama_text

    return _template_explanation(allergy_result, nutrition_result, verdict)
