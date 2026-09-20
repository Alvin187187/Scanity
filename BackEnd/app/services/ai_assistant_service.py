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
    lines = [
        f"**{verdict}** for **{name}**, checked against {allergies}.",
    ]
    if flags:
        for item in flags[:4]:
            lines.append(f"- Flagged item: **{item}** (from the scan result).")
    else:
        lines.append("- No avoid-level allergy flags were recorded for this scan.")
    lines.append("- I can explain ingredients in plain words, but I am not a doctor - confirm the package.")
    return "\n".join(lines)


def _template_report(product: dict, profile: dict) -> str:
    name = product.get("product_name") or "This product"
    verdict = (product.get("verdict") or "caution").capitalize()
    score = product.get("safety_score")
    allergies = ", ".join(profile.get("allergies") or []) or "no saved allergies"
    conditions = ", ".join(profile.get("conditions") or []) or "none saved"
    flags = product.get("allergy_flags") or []
    lines = [
        f"**{verdict}**. **{name}** was checked against your profile ({allergies}; health notes: {conditions}).",
    ]
    if score is not None:
        lines.append(f"- Safety score: **{score}/100**.")
    if flags:
        lines.append(f"- Avoid / flagged: **{', '.join(str(item) for item in flags[:5])}**.")
    else:
        lines.append("- No avoid-level allergy flags were recorded for this scan.")
    lines.append("- Nutri-Score is nutrition quality only and does not change the allergy result.")
    lines.append("- This is a careful consumer summary, not medical advice - confirm ingredients on the package.")
    return "\n".join(lines)


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
