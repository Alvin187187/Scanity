"""
ai/allergy_engine.py

check_allergies(user_allergies, ingredients) -> flags[]

Deterministic, seed-based allergy matching. Gemini/any LLM never decides the
verdict - this is pure rule logic.
"""
import logging
import re

from seed.allergen_seed_loader import load_allergen_seed

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
    "tree-nuts": "tree_nuts",
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
    "wheat / gluten": "wheat",
    "gluten": "wheat",
    "fish": "fish",
    "sesame": "sesame",
}

# Carriers / processing aids that are not major allergens. Treating these as
# "caution" made products like bottled water look risky for no allergy reason.
INERT_INGREDIENTS = {
    "water",
    "purified water",
    "spring water",
    "mineral water",
    "natural mineral water",
    "carbonated water",
    "sparkling water",
    "distilled water",
    "filtered water",
    "drinking water",
    "still water",
    "aqua",
    "carbon dioxide",
    "co2",
    "nitrogen",
    "n2",
}

# "… water" phrases that are beverages/ingredients, not plain water.
_NON_INERT_WATER_MARKERS = (
    "coconut",
    "almond",
    "cashew",
    "hazelnut",
    "rice",
    "oat",
    "soy",
    "soya",
    "chestnut",
    "rose",
    "orange",
    "lemon",
    "lime",
    "tonic",
)


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


def _is_inert_ingredient(ingredient_text) -> bool:
    """True for plain water / gas carriers that should never raise Caution."""
    normalized = _normalize(ingredient_text)
    if not normalized:
        return False
    if normalized in INERT_INGREDIENTS:
        return True
    if normalized.endswith(" water"):
        if any(marker in normalized for marker in _NON_INERT_WATER_MARKERS):
            return False
        # Keep short water-like phrases inert ("natural spring water").
        if len(normalized.split()) <= 4:
            return True
    return False


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
    # Labels often bury an allergen inside a longer phrase ("contains milk solids").
    for key, row in name_lookup.items():
        if key and key in normalized:
            return row, "contains_name"
    for key, row in alias_lookup.items():
        if key and len(key) > 3 and key in normalized:
            return row, "contains_alias"
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
            logger.warning("Non-string ingredient entry ignored: %r", ingredient)
            flags.append({
                "ingredient": str(ingredient),
                "status": "caution",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "Ingredient entry was not valid text and could not be checked.",
            })
            continue

        if _is_inert_ingredient(ingredient):
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "Inert carrier (e.g. water/gas) - not a major allergen risk.",
            })
            continue

        kb_entry, match_type = _match_ingredient(ingredient, name_lookup, alias_lookup)

        if kb_entry is None:
            logger.warning("Unmapped ingredient (not in seed): %r", ingredient)
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
                "reason": (
                    f"Matches your declared {kb_entry['allergen_category']} allergy "
                    f"(matched via {match_type} to '{kb_entry['ingredient_name']}')."
                ),
            })
        else:
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": kb_entry["allergen_category"],
                "matched_kb_entry": kb_entry["ingredient_name"],
                "reason": (
                    f"Identified as {kb_entry['allergen_category']}, which is not in your "
                    "declared allergies."
                ),
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


def compute_safety_score(flags: list) -> int:
    """
    Personalized allergy safety score on a 0-100 scale (separate from Nutri-Score).

    Formula (deterministic, no LLM):
    - No ingredient evidence → 50 (unknown mid-band).
    - Any Avoid (matched user allergen) → hard low band:
        score = max(0, 22 - 7 * (avoid_count - 1))
    - Else any Caution (unmapped) → mid band:
        score = max(40, 72 - 8 * caution_count)
    - Else all Safe → 100.

    Bands for UI: 0-39 Avoid, 40-69 Caution, 70-100 Safe.
    """
    if not flags:
        return 50

    avoid_count = sum(1 for item in flags if item.get("status") == "avoid")
    caution_count = sum(1 for item in flags if item.get("status") == "caution")

    if avoid_count:
        return max(0, 22 - 7 * (avoid_count - 1))
    if caution_count:
        return max(40, 72 - 8 * caution_count)
    return 100


class AllergyMatchService:
    """Thin facade so docs/prompts can name the matcher without changing call sites."""

    @staticmethod
    def match(user_allergies: list, ingredients: list) -> list:
        return check_allergies(user_allergies, ingredients)


class VerdictResolver:
    """Thin facade for overall Safe / Caution / Avoid from matcher flags."""

    @staticmethod
    def resolve(flags: list) -> str:
        return overall_verdict(flags)


if __name__ == "__main__":
    flags = check_allergies(["dairy"], ["sugar", "sodium caseinate", "salt"])
    for item in flags:
        print(item)
    print("Overall verdict:", overall_verdict(flags))
