"""Profile-aware AI coach replies for chat and safety reports."""

from __future__ import annotations

import re

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai
from ai.prompt import (
    COACH_SYSTEM_INSTRUCTIONS,
    build_coach_chat_prompt,
    build_safety_report_prompt,
)


def _friendly_name(product: dict) -> str:
    return str(product.get("product_name") or "this product").strip() or "this product"


def _verdict_label(product: dict) -> str:
    return (str(product.get("verdict") or "caution").strip() or "caution").capitalize()


def _template_chat(message: str, product: dict, profile: dict) -> str:
    """Answer the shopper's question in plain words — never dump the same blurb."""
    name = _friendly_name(product)
    verdict = _verdict_label(product)
    flags = [str(item) for item in (product.get("allergy_flags") or []) if str(item).strip()]
    allergies = [str(item) for item in (profile.get("allergies") or []) if str(item).strip()]
    q = (message or "").strip().lower()

    # Ingredient / "what is" questions
    what_match = re.search(
        r"(?:what(?:'s| is| are)?|explain|tell me about|define)\s+(.+?)(?:\?|$)",
        q,
    )
    if what_match or any(word in q for word in ("ingredient", "additive", "e-number", "enumber")):
        focus = (what_match.group(1).strip() if what_match else "").strip(" .?")
        if focus and focus not in {"it", "this", "that", "the ingredient"}:
            return (
                f"**{focus.title()}** is one of the names on **{name}**'s label.\n"
                f"- Scanity's result for this product is still **{verdict}**.\n"
                "- Open the ingredient chip on the result for a short plain-language note.\n"
                "- This is consumer guidance, not medical advice."
            )
        if flags:
            bullets = "\n".join(f"- **{item}** showed up in your scan notes." for item in flags[:4])
            return (
                f"Here's what stood out on **{name}**:\n{bullets}\n"
                f"- Overall result: **{verdict}**."
            )

    # Can I eat / is it safe
    if any(
        phrase in q
        for phrase in (
            "can i eat",
            "can i drink",
            "is it safe",
            "is this safe",
            "should i avoid",
            "okay for me",
            "ok for me",
            "safe for me",
        )
    ):
        allergy_bit = ", ".join(allergies[:3]) if allergies else "your saved allergies"
        if verdict == "Avoid":
            lead = f"**Better to skip** **{name}** for now — it lined up with **{allergy_bit}**."
        elif verdict == "Safe":
            lead = f"**Looks okay** for **{allergy_bit}** based on this label check of **{name}**."
        else:
            lead = f"**Take a closer look** at **{name}** — Scanity marked it **{verdict}** for your profile."
        lines = [lead]
        if flags:
            lines.append("- Watch for: " + ", ".join(f"**{item}**" for item in flags[:4]) + ".")
        lines.append("- Double-check the package if anything looks different. Not medical advice.")
        return "\n".join(lines)

    # Sugar / diabetes style
    if any(word in q for word in ("sugar", "diabetes", "sweet", "carb")):
        nutrition = product.get("nutrition") if isinstance(product.get("nutrition"), dict) else {}
        sugars = nutrition.get("sugars_g")
        sugar_line = (
            f"- Sugars on this label: **{sugars} g/100g**."
            if sugars is not None
            else "- Sugars were not listed on this scan's nutrition panel."
        )
        return (
            f"About sugar in **{name}**:\n"
            f"- Scanity's allergy result is **{verdict}** (separate from nutrition).\n"
            f"{sugar_line}\n"
            "- This is consumer guidance, not medical advice."
        )

    # Default: answer with this product's facts, no canned closer.
    lines = [
        f"On **{name}**, Scanity's result is **{verdict}**.",
    ]
    if flags:
        lines.append("- Watch-outs: " + ", ".join(f"**{item}**" for item in flags[:4]) + ".")
    elif allergies:
        lines.append(f"- Checked against: {', '.join(allergies[:3])}.")
    else:
        lines.append("- No avoid-level allergy flags on this scan.")
    score = product.get("safety_score")
    if score is not None:
        lines.append(f"- Allergy safety score: {score}/100 (70+ is Safe; incomplete labels stay in Caution).")
    grade = product.get("nutri_score_grade")
    if grade:
        lines.append(f"- Nutri-Score: **{str(grade).upper()}** (nutrition quality only).")
    else:
        lines.append("- Nutri-Score was not available for this product.")
    return "\n".join(lines)


def _template_report(product: dict, profile: dict) -> str:
    name = _friendly_name(product)
    verdict = _verdict_label(product)
    score = product.get("safety_score")
    allergies = ", ".join(str(item) for item in (profile.get("allergies") or [])[:4]) or "no saved allergies"
    conditions = ", ".join(str(item) for item in (profile.get("conditions") or [])[:4]) or "none saved"
    flags = [str(item) for item in (product.get("allergy_flags") or []) if str(item).strip()]
    lines = [
        f"{verdict} for {name}.",
        f"- Checked with your notes: {allergies}"
        + (f"; health notes: {conditions}." if conditions != "none saved" else "."),
    ]
    if score is not None:
        lines.append(f"- Safety score: {score}/100.")
    if flags:
        lines.append("- Watch-outs: " + ", ".join(str(item) for item in flags[:5]) + ".")
    else:
        lines.append("- No avoid-level allergy flags on this scan.")
    lines.append("- Nutri-Score is about nutrition quality, not allergy safety.")
    lines.append("- Consumer summary only — not medical advice.")
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
        max_output_tokens=320,
        temperature=0.25,
    )
    name = _friendly_name(product)
    if text and text != FALLBACK_TEXT:
        token = name.split()[0] if name and name != "this product" else ""
        if not token or token.lower() in text.lower() or (product.get("barcode") and str(product.get("barcode")) in text):
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
        temperature=0.25,
    )
    if text and text != FALLBACK_TEXT:
        return text
    return _template_report(product, profile)
