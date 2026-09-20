"""
ai/condition_engine.py

Deterministic health-condition checks layered on top of allergy flags.
Gemini never decides these - rules only. Used for diabetes, lactose,
hypertension, celiac, and similar profile conditions.
"""

from __future__ import annotations

import re

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


def _marker_hit(ingredient: str, markers: set[str]) -> str | None:
    normalized = _normalize(ingredient)
    if not normalized:
        return None
    # Longer markers first so "high fructose corn syrup" wins over "sugar".
    for marker in sorted(markers, key=len, reverse=True):
        if not marker:
            continue
        if normalized == marker or f" {marker} " in f" {normalized} ":
            return marker
        if marker in normalized and len(marker) >= 4:
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
                item["reason"] = (
                    f"Feature flag `{diet}` matches your saved health profile."
                )
                item["plain_explanation"] = item.get("possible_effects") or item.get("plain_explanation") or (
                    f"This ingredient is tagged for {diet.replace('_', ' ')} on your profile."
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

    # Nutrition-panel checks (per 100g style numbers from OFF / scan).
    nutrition = nutrition or {}
    sugars = nutrition.get("sugars_g")
    sodium = nutrition.get("sodium_mg")
    sat_fat = nutrition.get("sat_fat_g")

    def _append_nutrition_flag(name: str, status: str, condition: str, reason: str, plain: str) -> None:
        existing = next((row for row in out if _normalize(str(row.get("ingredient"))) == _normalize(name)), None)
        if existing:
            current = str(existing.get("status") or "safe").lower()
            if severity_rank.get(status, 0) > severity_rank.get(current, 0):
                existing["status"] = status
                existing["condition"] = condition
                existing["reason"] = reason
                existing["plain_explanation"] = plain
                existing["matched_category"] = existing.get("matched_category") or condition
            return
        out.append(
            {
                "ingredient": name,
                "status": status,
                "matched_category": condition,
                "matched_kb_entry": name,
                "condition": condition,
                "reason": reason,
                "plain_explanation": plain,
            }
        )

    if "diabetes" in active and isinstance(sugars, (int, float)):
        if sugars >= 22:
            _append_nutrition_flag(
                f"Sugars {sugars:g} g/100g",
                "caution",
                "diabetes",
                "Nutrition panel shows high sugars for a diabetes profile.",
                "High sugars per 100g. For diabetes, this drink/food can spike blood sugar quickly.",
            )
        elif sugars >= 8:
            _append_nutrition_flag(
                f"Sugars {sugars:g} g/100g",
                "caution",
                "diabetes",
                "Nutrition panel sugars are elevated for a diabetes profile.",
                "Moderate-to-notable sugars per 100g. Check serving size if you manage diabetes.",
            )

    if "hypertension" in active and isinstance(sodium, (int, float)):
        if sodium >= 600:
            _append_nutrition_flag(
                f"Sodium {sodium:g} mg/100g",
                "caution",
                "hypertension",
                "Nutrition panel sodium is high for hypertension.",
                "High sodium per 100g. Lower-salt options are usually better with high blood pressure.",
            )
        elif sodium >= 300:
            _append_nutrition_flag(
                f"Sodium {sodium:g} mg/100g",
                "caution",
                "hypertension",
                "Nutrition panel sodium is notable for hypertension.",
                "Notable sodium per 100g. Keep daily salt budget in mind.",
            )

    if "heart" in active and isinstance(sat_fat, (int, float)) and sat_fat >= 5:
        _append_nutrition_flag(
            f"Sat. fat {sat_fat:g} g/100g",
            "caution",
            "heart",
            "Saturated fat is elevated for a heart-disease profile.",
            "Higher saturated fat per 100g. Heart-aware eating usually limits this.",
        )

    return out


def compute_personalized_score(
    flags: list,
    *,
    conditions: list | None = None,
    nutrition: dict | None = None,
) -> int:
    """
    Personalized 0-100 score using allergies + conditions + nutrition.

    Bands: 0-39 Avoid, 40-69 Caution, 70-100 Safe.
    """
    active = normalize_conditions(conditions)
    nutrition = nutrition or {}

    if not flags:
        # Incomplete label - not a fake perfect score.
        base = 78
        if "diabetes" in active and isinstance(nutrition.get("sugars_g"), (int, float)):
            sugars = float(nutrition["sugars_g"])
            if sugars >= 22:
                return 48
            if sugars >= 8:
                return 58
        return base

    avoid_items = [item for item in flags if item.get("status") == "avoid"]
    caution_items = [item for item in flags if item.get("status") == "caution"]

    if avoid_items:
        # Hard low band for profile allergen / lactose / gluten hits.
        return max(0, 26 - 7 * (len(avoid_items) - 1))

    score = 100

    for item in caution_items:
        # Condition-backed cautions hurt more than "unmapped ingredient".
        if item.get("condition") or item.get("matched_category") in active:
            score -= 12
        elif str(item.get("ingredient") or "").lower().startswith("sugars "):
            score -= 14
        elif str(item.get("ingredient") or "").lower().startswith("sodium "):
            score -= 12
        else:
            score -= 3

    # Extra nutrition pressure even if ingredient list missed sugar words.
    sugars = nutrition.get("sugars_g")
    if "diabetes" in active and isinstance(sugars, (int, float)):
        if sugars >= 22:
            score -= 22
        elif sugars >= 12:
            score -= 14
        elif sugars >= 5:
            score -= 8

    sodium = nutrition.get("sodium_mg")
    if "hypertension" in active and isinstance(sodium, (int, float)):
        if sodium >= 600:
            score -= 18
        elif sodium >= 300:
            score -= 10

    if caution_items:
        # Keep caution-band ceiling so UI does not say Safe with open issues.
        score = min(score, 66)

    return max(0, min(100, int(round(score))))
