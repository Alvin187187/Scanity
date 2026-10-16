"""
ai/condition_engine.py

Deterministic health-condition checks layered on top of allergy flags.
Gemini never decides these - rules only. Used for diabetes, lactose,
hypertension, celiac, and similar profile conditions.
"""

from __future__ import annotations

import re

from ai.safety_score import FSA_NUTRIENTS, fsa_band, nutrition_flag_copy

# Ingredient markers that matter for each condition.
CONDITION_MARKERS: dict[str, dict] = {
    "diabetes": {
        "severity": "caution",
        "markers": {
            "sugar",
            "white sugar",
            "brown sugar",
            "cane sugar",
            "sucrose",
            "glucose",
            "dextrose",
            "fructose",
            "maltose",
            "high fructose corn syrup",
            "hfcs",
            "corn syrup",
            "glucose syrup",
            "invert sugar",
            "maltodextrin",
            "honey",
            "molasses",
            "caramel",
            "sweetened",
        },
        "reason": "Added sugars / sweet carbs matter when you manage diabetes.",
        "plain": "This adds sugars or fast carbs. For diabetes, watch portion and total sugars.",
    },
    "lactose": {
        "severity": "avoid",
        "markers": {
            "milk",
            "lactose",
            "whey",
            "casein",
            "caseinate",
            "cream",
            "butter",
            "cheese",
            "yogurt",
            "yoghurt",
            "skim milk",
            "milk solids",
            "milk powder",
            "dairy",
            "ghee",
            "buttermilk",
        },
        "reason": "Dairy / lactose-related ingredient with lactose intolerance on your profile.",
        "plain": "Likely contains lactose or milk sugar. People with lactose intolerance often need to avoid or limit this.",
    },
    "celiac": {
        "severity": "avoid",
        "markers": {
            "wheat",
            "barley",
            "rye",
            "malt",
            "gluten",
            "spelt",
            "semolina",
            "couscous",
            "seitan",
        },
        "reason": "Gluten-containing grain with celiac disease on your profile.",
        "plain": "Contains gluten or a gluten grain. Not suitable when you have celiac disease.",
    },
    "hypertension": {
        "severity": "caution",
        "markers": {
            "salt",
            "sea salt",
            "sodium chloride",
            "sodium",
            "msg",
            "monosodium glutamate",
            "soy sauce",
            "baking soda",
            "sodium bicarbonate",
            "sodium nitrite",
            "sodium benzoate",
        },
        "reason": "Sodium-related ingredient with hypertension on your profile.",
        "plain": "Adds sodium. With high blood pressure, lower-sodium choices are usually safer.",
    },
    "kidney": {
        "severity": "caution",
        "markers": {
            "salt",
            "sodium",
            "phosphate",
            "potassium",
            "msg",
            "protein",
        },
        "reason": "Mineral / sodium load can matter with kidney disease.",
        "plain": "May add sodium, potassium, or phosphate load. Confirm with your clinician's guidance.",
    },
    "heart": {
        "severity": "caution",
        "markers": {
            "salt",
            "sodium",
            "palm oil",
            "hydrogenated",
            "partially hydrogenated",
            "lard",
            "tallow",
        },
        "reason": "Salt or saturated/trans-fat related item with heart disease on your profile.",
        "plain": "May raise sodium or saturated-fat load. Keep an eye on the nutrition panel.",
    },
    "ibs": {
        "severity": "caution",
        "markers": {
            "inulin",
            "chicory",
            "sorbitol",
            "mannitol",
            "xylitol",
            "maltitol",
            "fructose",
            "lactose",
            "onion",
            "garlic",
            "wheat",
        },
        "reason": "Possible IBS trigger ingredient on the label.",
        "plain": "Can trigger IBS symptoms for some people. Tolerance varies - check your own pattern.",
    },
}


def _normalize(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower().strip()
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_conditions(conditions: list | None) -> set[str]:
    out: set[str] = set()
    for raw in conditions or []:
        name = _normalize(str(raw or ""))
        if not name or name in {"none", "other"}:
            continue
        # UI / API synonyms
        if name in {"lactose intolerance", "lactose_intolerance"}:
            name = "lactose"
        if name in {"high blood pressure", "blood pressure"}:
            name = "hypertension"
        if name in {"coeliac", "celiac disease"}:
            name = "celiac"
        if name in {"ibs crohn", "crohn", "crohns", "crohn s"}:
            name = "ibs"
        out.add(name.replace(" ", "_") if name not in CONDITION_MARKERS else name)
        # Also keep spaced form mapped to underscore keys above
        if name.replace("_", "") in {k.replace("_", "") for k in CONDITION_MARKERS}:
            for key in CONDITION_MARKERS:
                if key.replace("_", "") == name.replace("_", ""):
                    out.add(key)
    return out


_PLANT_MILK = re.compile(
    r"\b(?:coconut|oat|almond|soy|soya|rice|cashew|hemp)\s+milks?\b"
)
# These are not salt. "sodium caseinate" must not become a blood-pressure flag.
_NON_SALT_SODIUM = re.compile(
    r"\b(?:caseinate|ascorbate|citrate|citrates|stearoyl|erythorbate)\b"
)


def _marker_hit(ingredient: str, markers: set[str]) -> str | None:
    """Whole words only. 'wheat' must not hit buckwheat, and 'rice' must not hit licorice."""
    normalized = _normalize(ingredient)
    if not normalized:
        return None
    padded = f" {normalized} "
    # Longer markers first so "high fructose corn syrup" wins over "sugar".
    for marker in sorted(markers, key=len, reverse=True):
        token = _normalize(marker)
        if not token:
            continue
        if f" {token} " not in padded and f" {token}s " not in padded:
            continue
        if token == "sodium" and _NON_SALT_SODIUM.search(normalized):
            continue
        if token == "milk" and _PLANT_MILK.search(normalized):
            continue
        return marker
    return None


def apply_condition_rules(
    flags: list[dict],
    conditions: list | None,
    nutrition: dict | None = None,
) -> list[dict]:
    """
    Upgrade allergy-engine flags using health conditions.

    Example: sugar marked safe by pantry rules becomes caution when diabetes
    is on the profile. Milk becomes avoid when lactose is on the profile.
    """
    active = normalize_conditions(conditions)
    if not flags:
        flags = []
    out = [dict(item) for item in flags]

    severity_rank = {"safe": 0, "caution": 1, "avoid": 2}

    # Diet feature flag → default severity when it hits the shopper profile.
    diet_severity = {
        "lactose": "avoid",
        "celiac": "avoid",
        "diabetes": "caution",
        "hypertension": "caution",
        "heart": "caution",
        "kidney": "caution",
        "ibs": "caution",
    }

    for item in out:
        ingredient = str(item.get("ingredient") or "")
        # Prefer structured feature flags when present (easier, less false noise).
        flag_diets = {
            _normalize(str(value))
            for value in (item.get("affects_diets") or [])
            if value
        }
        if not flag_diets and isinstance(item.get("knowledge"), dict):
            flag_diets = {
                _normalize(str(value))
                for value in (item.get("knowledge") or {}).get("affects_diets") or []
                if value
            }
        for diet in flag_diets:
            if diet not in active:
                continue
            target = diet_severity.get(diet, "caution")
            current = str(item.get("status") or "safe").lower()
            if severity_rank.get(target, 0) > severity_rank.get(current, 0):
                item["status"] = target
                item["matched_category"] = item.get("matched_category") or diet
                item["condition"] = diet
                label = diet.replace("_", " ")
                item["reason"] = f"This matches a dietary restriction you saved ({label})."
                item["plain_explanation"] = item.get("possible_effects") or (
                    f"This ingredient is tagged for {label} on your profile."
                )

        for condition, spec in CONDITION_MARKERS.items():
            if condition not in active:
                continue
            # Skip marker hunting when feature flags already covered this diet.
            if condition in flag_diets:
                continue
            hit = _marker_hit(ingredient, spec["markers"])
            if not hit:
                continue
            target = spec["severity"]
            current = str(item.get("status") or "safe").lower()
            if severity_rank.get(target, 0) > severity_rank.get(current, 0):
                item["status"] = target
                item["matched_category"] = item.get("matched_category") or condition
                item["condition"] = condition
                item["reason"] = spec["reason"]
                item["plain_explanation"] = spec["plain"]
                item["matched_kb_entry"] = item.get("matched_kb_entry") or hit

    # Nutrition-panel checks use the same UK front-of-pack cut-offs as the score.
    # One nutrient produces one flag. The score reads the number once, not again
    # from this flag row.
    nutrition = nutrition or {}

    def _nutrient_markers(name: str) -> set[str]:
        target = _normalize(name)
        if target.startswith("sugar"):
            return set(CONDITION_MARKERS["diabetes"]["markers"])
        if target.startswith("sodium"):
            return set(CONDITION_MARKERS["hypertension"]["markers"])
        if "fat" in target:
            return {"palm oil", "hydrogenated", "partially hydrogenated", "lard", "tallow", "saturated fat"}
        return set()

    def _append_nutrition_flag(name: str, status: str, condition: str, reason: str, plain: str) -> None:
        markers = _nutrient_markers(name)
        target = _normalize(name)
        existing = None
        for row in out:
            ingredient = str(row.get("ingredient") or "")
            if _normalize(ingredient) == target or (markers and _marker_hit(ingredient, markers)):
                existing = row
                break
        if existing:
            current = str(existing.get("status") or "safe").lower()
            if severity_rank.get(status, 0) > severity_rank.get(current, 0):
                existing["status"] = status
                existing["condition"] = condition
                existing["reason"] = reason
                existing["matched_category"] = existing.get("matched_category") or condition
            if plain:
                prior = str(existing.get("plain_explanation") or "").strip()
                if prior and plain not in prior:
                    existing["plain_explanation"] = f"{prior} {plain}"
                elif not prior:
                    existing["plain_explanation"] = plain
            return
        out.append(
            {
                "ingredient": name,
                "status": status,
                "matched_category": condition,
                "matched_kb_entry": name,
                "condition": condition,
                "panel": True,
                "reason": reason,
                "plain_explanation": plain,
            }
        )

    for key, spec in FSA_NUTRIENTS.items():
        owners = [name for name in spec["conditions"] if name in active]
        if not owners:
            continue
        value = nutrition.get(key)
        band = fsa_band(value, spec["low"], spec["high"])
        if band not in {"amber", "red"}:
            continue
        name, reason, plain = nutrition_flag_copy(key, value, band, owners[0])
        _append_nutrition_flag(name, "caution", owners[0], reason, plain)

    return out


def explain_personalized_score(
    flags: list,
    *,
    conditions: list | None = None,
    nutrition: dict | None = None,
) -> dict:
    """Score plus the lines that produced it. Same inputs always rebuild it."""
    from ai.safety_score import build_safety_score

    return build_safety_score(flags, conditions=conditions, nutrition=nutrition)


def compute_personalized_score(
    flags: list,
    *,
    conditions: list | None = None,
    nutrition: dict | None = None,
) -> int:
    """
    Personalized 0-100 evidence index.

    Bands: 0-39 Avoid, 40-69 Caution, 70-100 Safe.
    The number is fully described by explain_personalized_score().
    """
    return explain_personalized_score(flags, conditions=conditions, nutrition=nutrition)["score"]
