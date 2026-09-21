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
_LOOKUP_CACHE = None

# Maps free-text allergen names (as they may appear in a real user profile,
# e.g. allergy_types.allergen_name) to the seed's canonical category slugs.
# Without this, a user profile saved as "dairy" would never match the seed's
# "milk" category, producing a false "safe" on a real milk allergen.
CATEGORY_SYNONYMS = {
    "dairy": "milk",
    "milk": "milk",
    "lactose": "milk",
    "tree nuts": "tree_nuts",
    "tree nut": "tree_nuts",
    "treenuts": "tree_nuts",
    "tree_nuts": "tree_nuts",
    "tree-nuts": "tree_nuts",
    "soybeans": "soy",
    "soybean": "soy",
    "soy": "soy",
    "soya": "soy",
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
    "mustard": "mustard",
    "celery": "celery",
    "sulphites": "sulphites",
    "sulfites": "sulphites",
    "sulphur dioxide": "sulphites",
    "sulfur dioxide": "sulphites",
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


def _get_lookups():
    global _LOOKUP_CACHE
    if _LOOKUP_CACHE is None:
        _LOOKUP_CACHE = _build_lookup(_get_seed())
    return _LOOKUP_CACHE


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


def _friendly_allergy_label(raw_category) -> str:
    """Shopper-facing allergy name (no underscores / jargon)."""
    slug = _normalize_allergy_category(raw_category)
    labels = {
        "milk": "dairy / milk",
        "egg": "egg",
        "peanut": "peanut",
        "tree_nuts": "tree nuts",
        "soy": "soy",
        "wheat": "wheat / gluten",
        "fish": "fish",
        "shellfish": "shellfish",
        "sesame": "sesame",
        "mustard": "mustard",
        "celery": "celery",
        "sulphites": "sulphites",
        "lactose": "lactose / dairy",
        "diabetes": "added sugars",
    }
    if slug in labels:
        return labels[slug]
    return (raw_category or slug or "this allergen").replace("_", " ").strip()


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
    sorted_names = sorted(name_lookup.keys(), key=len, reverse=True)
    sorted_aliases = sorted(alias_lookup.keys(), key=len, reverse=True)
    return name_lookup, alias_lookup, sorted_names, sorted_aliases


SKIP_CONTAINS_KEYS = {
    "flavor",
    "flavour",
    "flavoring",
    "flavouring",
    "seasoning",
    "extract",
    "powder",
    "natural",
    "artificial",
    "organic",
    "blend",
    "base",
    "mix",
    "sauce",
    "oil",
    "acid",
    "color",
    "colour",
    "spice",
    "spices",
}


def _match_ingredient(ingredient_text, name_lookup, alias_lookup, sorted_names, sorted_aliases):
    normalized = _normalize(ingredient_text)
    if not normalized:
        return None, "invalid_input"
    if normalized in name_lookup:
        return name_lookup[normalized], "exact_name"
    if normalized in alias_lookup:
        return alias_lookup[normalized], "alias"
    # Labels often bury an allergen inside a longer phrase ("contains milk solids").
    # Prefer longer keys and require word-boundary style matches to avoid
    # "rice" hitting inside unrelated tokens.
    for key in sorted_names:
        if len(key) < 4 or len(key) > len(normalized):
            continue
        if key in SKIP_CONTAINS_KEYS:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", normalized):
            return name_lookup[key], "contains_name"
    for key in sorted_aliases:
        if len(key) < 5 or len(key) > len(normalized):
            continue
        if key in SKIP_CONTAINS_KEYS:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", normalized):
            return alias_lookup[key], "contains_alias"
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
    name_lookup, alias_lookup, sorted_names, sorted_aliases = _get_lookups()
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
                "reason": "This ingredient entry was not readable, so Scanity could not check it.",
            })
            continue

        if _is_inert_ingredient(ingredient):
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": None,
                "matched_kb_entry": None,
                "reason": "A simple carrier (like water) — not a major allergen on its own.",
                "plain_explanation": "A carrier ingredient that is not a major allergen by itself.",
            })
            continue

        if _is_benign_pantry_ingredient(ingredient):
            try:
                from seed.ingredient_knowledge_loader import lookup_ingredient_knowledge

                knowledge = lookup_ingredient_knowledge(ingredient)
            except Exception:
                knowledge = None
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": None,
                "matched_kb_entry": (knowledge or {}).get("ingredient_name"),
                "affects_allergens": list((knowledge or {}).get("affects_allergens") or []),
                "affects_diets": list((knowledge or {}).get("affects_diets") or []),
                "possible_effects": (knowledge or {}).get("possible_effects") or "",
                "reason": "Everyday pantry item — not linked to your saved allergies.",
                "plain_explanation": (knowledge or {}).get("what_it_is")
                or (knowledge or {}).get("possible_effects")
                or "A common food ingredient.",
            })
            continue

        kb_entry, _match_type = _match_ingredient(
            ingredient,
            name_lookup,
            alias_lookup,
            sorted_names,
            sorted_aliases,
        )

        if kb_entry is None:
            # Known additives / pantry items from ingredient knowledge are
            # explained via clickable chips - they are not allergy "Flagged"
            # unless their feature flags hit the shopper profile.
            try:
                from seed.ingredient_knowledge_loader import lookup_ingredient_knowledge

                knowledge = lookup_ingredient_knowledge(ingredient)
            except Exception:
                knowledge = None
            if knowledge:
                affects_allergens = list(knowledge.get("affects_allergens") or [])
                affects_diets = list(knowledge.get("affects_diets") or [])
                hit_allergens = [
                    item for item in affects_allergens
                    if _normalize_allergy_category(item) in user_allergies_normalized
                ]
                if hit_allergens:
                    label = _friendly_allergy_label(hit_allergens[0])
                    flags.append({
                        "ingredient": ingredient,
                        "status": "avoid",
                        "matched_category": hit_allergens[0],
                        "matched_kb_entry": knowledge.get("ingredient_name"),
                        "affects_allergens": affects_allergens,
                        "affects_diets": affects_diets,
                        "possible_effects": knowledge.get("possible_effects") or "",
                        "reason": (
                            f"This looks like **{label}**, which you asked Scanity to watch for."
                        ),
                        "plain_explanation": knowledge.get("what_it_is")
                        or knowledge.get("possible_effects")
                        or f"**{ingredient}** is listed on this label.",
                    })
                    continue

                flags.append({
                    "ingredient": ingredient,
                    "status": "safe",
                    "matched_category": None,
                    "matched_kb_entry": knowledge.get("ingredient_name"),
                    "affects_allergens": affects_allergens,
                    "affects_diets": affects_diets,
                    "possible_effects": knowledge.get("possible_effects") or "",
                    "reason": "Recognized on the label — not linked to your saved allergies.",
                    "plain_explanation": knowledge.get("what_it_is")
                    or knowledge.get("possible_effects")
                    or f"**{ingredient}** is a known label ingredient.",
                })
                continue

            logger.warning("Unmapped ingredient (not in seed): %r", ingredient)
            flags.append({
                "ingredient": ingredient,
                "status": "caution",
                "matched_category": None,
                "matched_kb_entry": None,
                "affects_allergens": [],
                "affects_diets": [],
                "possible_effects": "",
                "reason": "Scanity could not fully confirm this ingredient yet — worth a closer look.",
                "plain_explanation": (
                    f"**{ingredient}** showed up on the label, but Scanity could not fully "
                    "match it to your saved allergies yet."
                ),
            })
            continue

        category_normalized = _normalize(kb_entry["allergen_category"])
        affects_allergens = list(kb_entry.get("affects_allergens") or ([kb_entry["allergen_category"]] if kb_entry.get("allergen_category") else []))
        affects_diets = list(kb_entry.get("affects_diets") or [])
        plain = kb_entry.get("possible_effects") or kb_entry.get("plain_explanation") or ""
        profile_hits = [
            item for item in affects_allergens
            if _normalize_allergy_category(item) in user_allergies_normalized
        ]
        if category_normalized in user_allergies_normalized or profile_hits:
            matched = profile_hits[0] if profile_hits else kb_entry["allergen_category"]
            label = _friendly_allergy_label(matched)
            flags.append({
                "ingredient": ingredient,
                "status": "avoid",
                "matched_category": matched,
                "matched_kb_entry": kb_entry["ingredient_name"],
                "affects_allergens": affects_allergens,
                "affects_diets": affects_diets,
                "possible_effects": plain,
                "reason": (
                    f"This looks like **{label}**, which you asked Scanity to watch for."
                ),
                "plain_explanation": plain or f"**{ingredient}** is linked to {label}.",
            })
        else:
            label = _friendly_allergy_label(kb_entry["allergen_category"])
            flags.append({
                "ingredient": ingredient,
                "status": "safe",
                "matched_category": kb_entry["allergen_category"],
                "matched_kb_entry": kb_entry["ingredient_name"],
                "affects_allergens": affects_allergens,
                "affects_diets": affects_diets,
                "possible_effects": plain,
                "reason": (
                    f"Identified as {label}, which is not in your saved allergies."
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
