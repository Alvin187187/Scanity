"""
ai/allergy_engine.py

check_allergies(user_allergies, ingredients) -> flags[]

Deterministic, seed-based allergy matching. Gemini/any LLM never decides the
verdict - this is pure rule logic.
"""
import logging
import re

from seed.allergen_seed_loader import load_allergen_seed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("allergy_engine")

_SEED_CACHE = None

def _get_seed():
    global _SEED_CACHE
    if _SEED_CACHE is None:
        _SEED_CACHE = load_allergen_seed()
    return _SEED_CACHE

def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text

def _build_lookup(seed):
    name_lookup = {}
    alias_lookup = {}
    for row in seed:
        name_lookup[_normalize(row["ingredient_name"])] = row
        for alias in row["aliases"]:
            alias_lookup[_normalize(alias)] = row
    return name_lookup, alias_lookup

def _match_ingredient(ingredient_text, name_lookup, alias_lookup):
    normalized = _normalize(ingredient_text)
    if normalized in name_lookup:
        return name_lookup[normalized], "exact_name"
    if normalized in alias_lookup:
        return alias_lookup[normalized], "alias"
    return None, "unmapped"

def check_allergies(user_allergies: list[str], ingredients: list[str]) -> list[dict]:
    seed = _get_seed()
    name_lookup, alias_lookup = _build_lookup(seed)
    user_allergies_normalized = {_normalize(a) for a in user_allergies}

    flags = []
    for ingredient in ingredients:
        kb_entry, match_type = _match_ingredient(ingredient, name_lookup, alias_lookup)

        if kb_entry is None:
            logger.warning(f"Unmapped ingredient (not in seed): {ingredient!r}")
            flags.append({
                "ingredient": ingredient,
                "status": "caution",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "Ingredient could not be matched to a known allergen - flagged for review.",
            })
            continue

        category_normalized = _normalize(kb_entry["allergen_category"])
        if category_normalized in user_allergies_normalized:
            flags.append({
                "ingredient": ingredient,
                "status": "avoid",
                "matched_category": kb_entry["allergen_category"],
                "matched_kb_entry": kb_entry["ingredient_name"],
                "reason": f"Matches your declared {kb_entry['allergen_category']} allergy (matched via {match_type} to '{kb_entry['ingredient_name']}').",
            })
        else:
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": kb_entry["allergen_category"],
                "matched_kb_entry": kb_entry["ingredient_name"],
                "reason": f"Identified as {kb_entry['allergen_category']}, which is not in your declared allergies.",
            })

    return flags

def overall_verdict(flags: list[dict]) -> str:
    statuses = {f["status"] for f in flags}
    if "avoid" in statuses:
        return "avoid"
    if "caution" in statuses:
        return "caution"
    return "safe"