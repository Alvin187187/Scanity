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

# Everyday pantry items that are not allergens by themselves. Without this,
# unmapped sugar/salt flooded the UI "Flagged" list and crushed the score.
BENIGN_PANTRY_INGREDIENTS = {
    "sugar",
    "white sugar",
    "brown sugar",
    "cane sugar",
    "beet sugar",
    "sucrose",
    "glucose",
    "dextrose",
    "fructose",
    "salt",
    "sea salt",
    "table salt",
    "kosher salt",
    "citric acid",
    "ascorbic acid",
    "vitamin c",
    "vinegar",
    "apple cider vinegar",
    "baking soda",
    "sodium bicarbonate",
    "baking powder",
    "corn starch",
    "cornstarch",
    "tapioca starch",
    "sunflower oil",
    "olive oil",
    "canola oil",
    "vegetable oil",
    "coconut oil",
    "black pepper",
    "pepper",
    "garlic",
    "onion",
    "onion powder",
    "garlic powder",
    "paprika",
    "turmeric",
    "cinnamon",
    "vanilla",
    "vanilla extract",
    "cocoa",
    "cocoa powder",
    "coffee",
    "tea",
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


def _is_benign_pantry_ingredient(ingredient_text) -> bool:
    normalized = _normalize(ingredient_text)
    if not normalized:
        return False
    if normalized in BENIGN_PANTRY_INGREDIENTS:
        return True
    # Short "sugar" / "salt" phrases inside longer tokens.
    for item in BENIGN_PANTRY_INGREDIENTS:
        if len(item) >= 4 and (normalized == item or normalized.endswith(f" {item}") or normalized.startswith(f"{item} ")):
            return True
    return False


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
                "plain_explanation": "A carrier ingredient that is not a major allergen by itself.",
            })
            continue

        if _is_benign_pantry_ingredient(ingredient):
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "Common pantry ingredient - not an allergy match for your profile.",
                "plain_explanation": "Everyday ingredient. Tap the chip for what it is and when to be careful.",
            })
            continue

        kb_entry, match_type = _match_ingredient(ingredient, name_lookup, alias_lookup)

        if kb_entry is None:
            # Known additives / pantry items from ingredient_knowledge.csv are
            # explained via clickable chips - they are not allergy "Flagged".
            try:
                from seed.ingredient_knowledge_loader import lookup_ingredient_knowledge

                knowledge = lookup_ingredient_knowledge(ingredient)
            except Exception:
                knowledge = None
            if knowledge:
                flags.append({
                    "ingredient": ingredient,
                    "status": "safe",
                    "matched_category": None,
                    "matched_kb_entry": knowledge.get("ingredient_name"),
                    "reason": "Identified in Scanity ingredient knowledge CSV - not an allergy match for your profile.",
                    "plain_explanation": knowledge.get("what_it_is")
                    or "Tap the chip for what this is and when to be careful.",
                })
                continue

            logger.warning("Unmapped ingredient (not in seed): %r", ingredient)
            flags.append({
                "ingredient": ingredient,
                "status": "caution",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "Ingredient could not be matched to a known allergen - flagged for review.",
                "plain_explanation": "We could not match this to our allergen CSV yet, so it is marked for a quick human check.",
            })
            continue

        category_normalized = _normalize(kb_entry["allergen_category"])
        plain = kb_entry.get("plain_explanation") or ""
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
                "plain_explanation": plain,
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
                "plain_explanation": plain,
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


def compute_safety_score(flags: list, conditions: list | None = None, nutrition: dict | None = None) -> int:
    """
    Personalized 0-100 score. Prefers condition + nutrition aware scoring.
    """
    from ai.condition_engine import compute_personalized_score

    return compute_personalized_score(flags, conditions=conditions, nutrition=nutrition)


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
