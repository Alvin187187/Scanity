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
from ai.prompt import COACH_SYSTEM_INSTRUCTIONS, SYSTEM_INSTRUCTIONS, build_explainer_prompt
from ai.rag_layer import enrich_prompt_with_rag

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
    lines = [f"**{label}** for this label based on your saved profile."]
    if flagged:
        why = (
            "matches your saved allergy"
            if label == "Avoid"
            else "needs a quick check because we could not fully confirm it"
        )
        for item in flagged[:4]:
            name = item.get("ingredient") or item.get("matched_kb_entry") or "an ingredient"
            lines.append(f"- **{name}** {why}.")
    elif label == "Safe":
        lines.append("- No ingredients matched your saved allergies.")
    else:
        lines.append("- Some ingredients could not be fully confirmed, so this is not treated as safe yet.")

    grade = (nutrition_result or {}).get("grade") if nutrition_result else None
    if grade:
        lines.append(
            f"- Nutri-Score **{str(grade).upper()}** is nutrition quality only and does not change the allergy result."
        )
    lines.append("- Confirm the package label if you are unsure. This is not medical advice.")
    return "\n".join(lines)


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


def explain_scan(
    allergy_result: dict,
    nutrition_result: dict | None,
    verdict: str,
    *,
    use_hosted_ai: bool = True,
) -> str:
    if not use_hosted_ai:
        return _template_explanation(allergy_result, nutrition_result, verdict)

    prompt = build_explainer_prompt(allergy_result, nutrition_result, verdict)
    flagged_names = [
        str(item.get("ingredient") or "")
        for item in (allergy_result.get("flagged_ingredients") or [])[:8]
    ]
    prompt = enrich_prompt_with_rag(
        prompt,
        " ".join([verdict, *flagged_names]),
        limit=5,
    )
    text = call_hosted_ai(
        prompt,
        system_instructions=COACH_SYSTEM_INSTRUCTIONS,
        max_output_tokens=420,
        temperature=0.35,
    )
    if text and text != FALLBACK_TEXT:
        return text

    ollama_text = _call_ollama(prompt)
    if ollama_text:
        return ollama_text

    return _template_explanation(allergy_result, nutrition_result, verdict)
