"""CSV-first ingredient explain, with Gemini RAG fallback when CSV misses."""

from __future__ import annotations

import json
import re

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai
from seed.ingredient_knowledge_loader import lookup_ingredient_knowledge

EXPLAIN_SYSTEM = """You are Scanity's ingredient research helper.
Return ONLY a compact JSON object (no markdown fences) with keys:
title, category, what_it_is, commonly_seen_in, possible_effects, source
Rules:
- Ground claims in general food-label / additive knowledge.
- Plain words for shoppers. No diagnosis, no treatment advice.
- If unsure, say so in possible_effects.
- Keep each string under 220 characters.
"""


def _from_csv(ingredient: str) -> dict | None:
    knowledge = lookup_ingredient_knowledge(ingredient)
    if not knowledge:
        return None
    return {
        "ingredient": ingredient,
        "title": knowledge["ingredient_name"],
        "category": knowledge.get("category") or "",
        "what_it_is": knowledge.get("what_it_is") or "",
        "commonly_seen_in": knowledge.get("commonly_seen_in") or "",
        "possible_effects": knowledge.get("possible_effects") or "",
        "source": knowledge.get("source") or "Scanity ingredient CSV",
        "aliases": knowledge.get("aliases") or [],
        "ai_source": "csv",
    }


def _parse_json_object(text: str) -> dict | None:
    raw = (text or "").strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def explain_ingredient(
    ingredient: str,
    *,
    product_name: str | None = None,
    profile_conditions: list[str] | None = None,
) -> dict:
    """CSV lookup first; Gemini structured research if missing."""
    name = (ingredient or "").strip()
    if not name:
        return {
            "ingredient": "",
            "title": "Unknown",
            "category": "",
            "what_it_is": "No ingredient name was provided.",
            "commonly_seen_in": "",
            "possible_effects": "",
            "source": "",
            "aliases": [],
            "ai_source": "none",
        }

    cached = _from_csv(name)
    if cached:
        return cached

    conditions = ", ".join(profile_conditions or []) or "none saved"
    prompt = (
        f"Ingredient label text: {name}\n"
        f"Product context: {product_name or 'unknown packaged food'}\n"
        f"Shopper conditions (context only): {conditions}\n\n"
        "Research what this ingredient/additive typically is on food labels."
    )
    text = call_hosted_ai(
        prompt,
        system_instructions=EXPLAIN_SYSTEM,
        max_output_tokens=320,
        temperature=0.2,
    )
    parsed = None if (not text or text == FALLBACK_TEXT) else _parse_json_object(text)
    if parsed:
        return {
            "ingredient": name,
            "title": str(parsed.get("title") or name).strip() or name,
            "category": str(parsed.get("category") or "").strip(),
            "what_it_is": str(parsed.get("what_it_is") or "").strip(),
            "commonly_seen_in": str(parsed.get("commonly_seen_in") or "").strip(),
            "possible_effects": str(parsed.get("possible_effects") or "").strip(),
            "source": str(parsed.get("source") or "Gemini research (not medical advice)").strip(),
            "aliases": [],
            "ai_source": "gemini",
        }

    return {
        "ingredient": name,
        "title": name,
        "category": "unknown",
        "what_it_is": (
            f"We could not find a CSV note for “{name}” and live research was unavailable. "
            "Confirm the package label."
        ),
        "commonly_seen_in": "Packaged foods (exact uses vary)",
        "possible_effects": "Unknown without a reliable source - verify on the label if you are sensitive.",
        "source": "Offline fallback",
        "aliases": [],
        "ai_source": "template",
    }
