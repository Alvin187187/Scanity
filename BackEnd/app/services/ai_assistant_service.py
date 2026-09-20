"""Profile-aware AI coach replies for chat and safety reports."""

from __future__ import annotations

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai
from ai.prompt import (
    COACH_SYSTEM_INSTRUCTIONS,
    build_coach_chat_prompt,
    build_safety_report_prompt,
)


def _template_chat(message: str, product: dict, profile: dict) -> str:
    name = product.get("product_name") or "this product"
    verdict = (product.get("verdict") or "caution").capitalize()
    allergies = ", ".join(profile.get("allergies") or []) or "your saved allergies"
    flags = product.get("allergy_flags") or []
    if flags:
        flagged = ", ".join(str(item) for item in flags[:4])
        return (
            f"{verdict} for {name} based on the scan. Flagged items include {flagged}, "
            f"checked against {allergies}. I can explain ingredients, but I am not a doctor — "
            f"double-check the package if you are unsure."
        )
    return (
        f"For {name}, the scan says {verdict}. I did not see a clear allergy flag in the "
        f"saved result for {allergies}. Ask me about a specific ingredient if you want more detail. "
        f"This is guidance only — confirm the label yourself."
    )


def _template_report(product: dict, profile: dict) -> str:
    name = product.get("product_name") or "This product"
    verdict = (product.get("verdict") or "caution").capitalize()
    score = product.get("safety_score")
    score_bit = f" Safety score: {score}/100." if score is not None else ""
    allergies = ", ".join(profile.get("allergies") or []) or "no saved allergies"
    conditions = ", ".join(profile.get("conditions") or []) or "none saved"
    flags = product.get("allergy_flags") or []
    flag_bit = (
        f" Flagged: {', '.join(str(item) for item in flags[:5])}."
        if flags
        else " No avoid-level allergy flags were recorded for this scan."
    )
    return (
        f"{verdict}. {name} was checked against your profile ({allergies}; health notes: {conditions})."
        f"{score_bit}{flag_bit} Nutri-Score is nutrition quality only and does not change the allergy result. "
        f"This is a careful consumer summary, not medical advice — confirm ingredients on the package."
    )


def answer_product_question(
    message: str,
    product: dict,
    profile: dict,
    history: list[dict] | None = None,
) -> str:
    prompt = build_coach_chat_prompt(message, product, profile, history or [])
    text = call_hosted_ai(
        prompt,
        system_instructions=COACH_SYSTEM_INSTRUCTIONS,
        max_output_tokens=280,
        temperature=0.35,
    )
    if text and text != FALLBACK_TEXT:
        return text
    return _template_chat(message, product, profile)


def build_safety_report(
    product: dict,
    profile: dict,
    focus: str | None = None,
) -> str:
    prompt = build_safety_report_prompt(product, profile, focus)
    text = call_hosted_ai(
        prompt,
        system_instructions=COACH_SYSTEM_INSTRUCTIONS,
        max_output_tokens=420,
        temperature=0.3,
    )
    if text and text != FALLBACK_TEXT:
        return text
    return _template_report(product, profile)
