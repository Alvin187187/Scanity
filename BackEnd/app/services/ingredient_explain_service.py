"""Fast ingredient explain: local knowledge first; Gemini never blocks chips."""

from __future__ import annotations

import json
import re
from functools import lru_cache

from ai.gemini_client import CHIP_TIMEOUT_SECONDS, FALLBACK_TEXT, call_hosted_ai
from ai.rag_layer import retrieve_local
from seed.ingredient_knowledge_loader import lookup_ingredient_knowledge

EXPLAIN_SYSTEM = """You are Scanity's ingredient research helper.
Return ONLY a compact JSON object (no markdown fences) with keys:
title, category, what_it_is, commonly_seen_in, possible_effects,
affects_allergens (array of strings), affects_diets (array of strings), source
Rules:
- Plain words for shoppers. No diagnosis, no treatment advice.
- Never mention CSV, offline mode, databases, or internal tooling.
- Keep each string under 160 characters.
"""


def _as_flag_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.replace(",", "|").split("|") if part.strip()]
    return []


def _from_knowledge(ingredient: str) -> dict | None:
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
        "affects_allergens": knowledge.get("affects_allergens") or [],
        "affects_diets": knowledge.get("affects_diets") or [],
        "source": knowledge.get("source") or "Scanity ingredient knowledge",
        "aliases": knowledge.get("aliases") or [],
        "ai_source": "knowledge",
    }


def _instant_local(ingredient: str) -> dict:
    """Useful shopper note without waiting on Gemini."""
    docs = retrieve_local(ingredient, limit=2)
    if docs:
        best = docs[0]
        text = (best.get("text") or "").strip()
        # Prefer the first sentence-ish chunk for "what it is".
        what = text
        for sep in (". ", " — ", " - "):
            if sep in text:
                what = text.split(sep, 1)[0].strip()
                if not what.endswith("."):
                    what += "."
                break
        return {
            "ingredient": ingredient,
            "title": best.get("title") or ingredient,
            "category": best.get("category") or "label ingredient",
            "what_it_is": (what[:220] if what else f"“{ingredient}” appears on this product label."),
            "commonly_seen_in": "Packaged foods (exact uses vary by brand)",
            "possible_effects": "Confirm the package label if you are sensitive or unsure.",
            "affects_allergens": [],
            "affects_diets": [],
            "source": best.get("source") or "Scanity knowledge",
            "aliases": [],
            "ai_source": "local",
        }
    return {
        "ingredient": ingredient,
        "title": ingredient,
        "category": "label ingredient",
        "what_it_is": (
            f"“{ingredient}” is listed on this product. "
            "Confirm the package wording if you have allergies or dietary limits."
        ),
        "commonly_seen_in": "Packaged foods (exact uses vary by brand)",
        "possible_effects": "Effects depend on the exact ingredient and your sensitivities.",
        "affects_allergens": [],
        "affects_diets": [],
        "source": "Scanity label note",
        "aliases": [],
        "ai_source": "instant",
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


@lru_cache(maxsize=256)
def _cached_gemini_explain(name: str, product_name: str, conditions: str) -> str:
    prompt = (
        f"Ingredient label text: {name}\n"
        f"Product context: {product_name or 'unknown packaged food'}\n"
        f"Shopper conditions (context only): {conditions or 'none saved'}\n\n"
        "Research what this ingredient/additive typically is on food labels. Be brief."
    )
    # Tiny local context only — avoid large RAG prompt bloat.
    docs = retrieve_local(name, limit=2)
    if docs:
        prompt += "\nHints:\n" + "\n".join(
            f"- {doc.get('title')}: {(doc.get('text') or '')[:160]}" for doc in docs
        )
    return call_hosted_ai(
        prompt,
        system_instructions=EXPLAIN_SYSTEM,
        max_output_tokens=220,
        temperature=0.15,
        timeout_seconds=CHIP_TIMEOUT_SECONDS,
    )


def explain_ingredient(
    ingredient: str,
    *,
    product_name: str | None = None,
    profile_conditions: list[str] | None = None,
    allow_hosted_ai: bool = False,
) -> dict:
    """Local knowledge / instant note first.

    Gemini is opt-in (`allow_hosted_ai=True`) so chip taps stay fast.
    Hosted model latency (often 2–8s+) must never block the default path.
    """
    name = (ingredient or "").strip()
    if not name:
        return {
            "ingredient": "",
            "title": "Unknown",
            "category": "",
            "what_it_is": "No ingredient name was provided.",
            "commonly_seen_in": "",
            "possible_effects": "",
            "affects_allergens": [],
            "affects_diets": [],
            "source": "",
            "aliases": [],
            "ai_source": "none",
        }

    cached = _from_knowledge(name)
    if cached:
        return cached

    instant = _instant_local(name)
    if not allow_hosted_ai:
        return instant

    conditions = ", ".join(profile_conditions or [])
    text = _cached_gemini_explain(name, product_name or "", conditions)
    parsed = None if (not text or text == FALLBACK_TEXT) else _parse_json_object(text)
    if parsed:
        return {
            "ingredient": name,
            "title": str(parsed.get("title") or name).strip() or name,
            "category": str(parsed.get("category") or "").strip(),
            "what_it_is": str(parsed.get("what_it_is") or "").strip() or instant["what_it_is"],
            "commonly_seen_in": str(parsed.get("commonly_seen_in") or "").strip()
            or instant["commonly_seen_in"],
            "possible_effects": str(parsed.get("possible_effects") or "").strip()
            or instant["possible_effects"],
            "affects_allergens": _as_flag_list(parsed.get("affects_allergens")),
            "affects_diets": _as_flag_list(parsed.get("affects_diets")),
            "source": str(parsed.get("source") or "AI research (not medical advice)").strip(),
            "aliases": [],
            "ai_source": "gemini",
        }

    return instant
