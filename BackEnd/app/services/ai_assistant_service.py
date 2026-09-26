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


def _deep_question(message: str) -> bool:
    q = (message or "").strip().lower()
    return any(
        token in q
        for token in ("why", "explain", "how come", "break down", "list ", "compare", "report", "tell me more")
    )


def _chill_reply(text: str, message: str) -> str:
    """Keep chat answers short and drop the stock closer on simple questions."""
    lines = [line.rstrip() for line in (text or "").splitlines() if line.strip()]
    if not lines:
        return (text or "").strip()
    drop = (
        "not medical advice",
        "consumer guidance",
        "double-check the package",
        "confirm the package",
    )
    if not _deep_question(message):
        lines = [line for line in lines if not any(token in line.lower() for token in drop)] or lines
    lead: list[str] = []
    bullets: list[str] = []
    bullet_cap = 3 if _deep_question(message) else 1
    lead_cap = 2
    for line in lines:
        if line.lstrip().startswith(("-", "*", "•")):
            if len(bullets) < bullet_cap:
                bullets.append(line.strip())
        elif len(lead) < lead_cap and not bullets:
            lead.append(line.strip())
    kept = lead + bullets
    return "\n".join(kept).strip() or (text or "").strip()


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
            return f"**{focus.title()}** is on the **{name}** label. This scan is **{verdict}**."
        if flags:
            return f"**{name}** is **{verdict}**. Watch for **{flags[0]}**."

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
            lead = f"Better to skip **{name}** for now. It lined up with {allergy_bit}."
        elif verdict == "Safe":
            lead = f"**{name}** looks **Safe** for {allergy_bit} on this label."
        else:
            lead = f"Take a closer look at **{name}**. This scan is **{verdict}**."
        if flags:
            return f"{lead}\n- Watch for **{flags[0]}**."
        return lead

    # Sugar / diabetes style
    if any(word in q for word in ("sugar", "diabetes", "sweet", "carb")):
        nutrition = product.get("nutrition") if isinstance(product.get("nutrition"), dict) else {}
        sugars = nutrition.get("sugars_g")
        sugar_sentence = (
            f"Sugars are **{sugars} g** per 100 g."
            if sugars is not None
            else "Sugars were not listed on this label."
        )
        return f"**{name}** is **{verdict}** for allergies. {sugar_sentence}"

    if flags:
        return f"**{name}** is **{verdict}**. Watch for **{flags[0]}**."
    if allergies:
        return f"**{name}** is **{verdict}** against {', '.join(allergies[:2])}."
    return f"**{name}** is **{verdict}** on this scan."


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
        max_output_tokens=160,
        temperature=0.2,
    )
    if text and text != FALLBACK_TEXT:
        return _chill_reply(text, message)
    return _chill_reply(_template_chat(message, product, profile), message)


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
