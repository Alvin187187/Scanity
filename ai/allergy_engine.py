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

# Maps free-text allergen names (as they may appear in a real user profile,
# e.g. allergy_types.allergen_name) to the seed's canonical category slugs.
# Without this, a user profile saved as "dairy" would never match the seed's
# "milk" category, producing a false "safe" on a real milk allergen.
CATEGORY_SYNONYMS = {
    "dairy": "milk",
    "milk": "milk",
    "tree nuts": "tree_nuts",
    "tree nut": "tree_nuts",
    "treenuts": "tree_nuts",
    "tree_nuts": "tree_nuts",
    "soybeans": "soy",
    "soybean": "soy",
    "soy": "soy",
    "shell fish": "shellfish",
    "shellfish": "shellfish",
    "peanuts": "peanut",
    "peanut": "peanut",
    "eggs": "egg",
    "egg": "egg",
    "wheat": "wheat",
    "fish": "fish",
}


def _get_seed():
    global _SEED_CACHE
    if _SEED_CACHE is None:
        _SEED_CACHE = load_allergen_seed()
    return _SEED_CACHE


def _normalize(text) -> str:
    """Lowercase, trim, collapse whitespace. Guards non-string input rather
    than crashing with AttributeError."""
    if not isinstance(text, str):
        return ""
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _normalize_allergy_category(raw_category) -> str:
    """Map a free-text user-declared allergy name to the seed's canonical
    category slug, via CATEGORY_SYNONYMS. Falls back to the normalized raw
    text if no synonym is found, so seed-native slugs still work unchanged."""
    normalized = _normalize(raw_category)
    return CATEGORY_SYNONYMS.get(normalized, normalized)


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
    if not normalized:
        return None, "invalid_input"
    if normalized in name_lookup:
        return name_lookup[normalized], "exact_name"
    if normalized in alias_lookup:
        return alias_lookup[normalized], "alias"
    return None, "unmapped"


def check_allergies(user_allergies: list, ingredients: list) -> list:
    """
    Args:
        user_allergies: list of allergen category names as declared by the
                         user, e.g. ["dairy", "Tree Nuts", "soybeans"].
                         Free-text synonyms are mapped to canonical seed
                         categories via CATEGORY_SYNONYMS.
        ingredients: list of raw ingredient strings, e.g. ["sugar", "sodium caseinate"].
                     Non-string entries are guarded, not crashed on.

    Returns:
        list[dict], one per input ingredient:
        {
            "ingredient": str,
            "status": "avoid" | "caution" | "safe",
            "matched_category": str | None,
            "matched_kb_entry": str | None,
            "reason": str,
        }

        Unmapped or invalid ingredients return status "caution", never "safe".
    """
    seed = _get_seed()
    name_lookup, alias_lookup = _build_lookup(seed)
    user_allergies_normalized = {_normalize_allergy_category(a) for a in (user_allergies or [])}

    flags = []
    for ingredient in (ingredients or []):
        if not isinstance(ingredient, str):
            logger.warning(f"Non-string ingredient entry ignored: {ingredient!r}")
            flags.append({
                "ingredient": str(ingredient),
                "status": "caution",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "Ingredient entry was not valid text and could not be checked.",
            })
            continue

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
                "reason": f"Matches your declared {kb_entry['allergen_category']} allergy "
                          f"(matched via {match_type} to '{kb_entry['ingredient_name']}').",
            })
        else:
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": kb_entry["allergen_category"],
                "matched_kb_entry": kb_entry["ingredient_name"],
                "reason": f"Identified as {kb_entry['allergen_category']}, which is not in your "
                          f"declared allergies.",
            })

    return flags


def overall_verdict(flags: list) -> str:
    """
    Precedence: avoid > caution > safe.

    An empty flags list (e.g. from an empty ingredient list) is NOT treated
    as safe - there is nothing to confirm as harmless, so this returns
    "caution" rather than defaulting to the most reassuring answer with zero
    evidence behind it.
    """
    if not flags:
        return "caution"
    statuses = {f["status"] for f in flags}
    if "avoid" in statuses:
        return "avoid"
    if "caution" in statuses:
        return "caution"
    return "safe"


if __name__ == "__main__":
    flags = check_allergies(["dairy"], ["sugar", "sodium caseinate", "salt"])
    for f in flags:
        print(f)
    print("Overall verdict:", overall_verdict(flags))