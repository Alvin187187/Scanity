"""
seed/enrich_feature_flags.py

Add machine-usable feature flags to ingredient knowledge (+ allergen effects):
  - affects_allergens: milk|egg|soy|...
  - affects_diets: diabetes|lactose|celiac|hypertension|heart|kidney|ibs
  - possible_effects: ensure every row has a usable shopper note

These flags make profile scoring a set intersection instead of brittle
substring marker hunting.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).parent
KNOWLEDGE = ROOT / "ingredient_knowledge.csv"
ALLERGENS = ROOT / "seed_allergens.csv"

ALLERGEN_KEYS = {
    "milk",
    "egg",
    "peanut",
    "tree_nuts",
    "soy",
    "wheat",
    "fish",
    "shellfish",
    "sesame",
    "mustard",
    "celery",
    "sulphites",
}

DIET_KEYS = {
    "diabetes",
    "lactose",
    "celiac",
    "hypertension",
    "heart",
    "kidney",
    "ibs",
}

# Token → allergen feature
ALLERGEN_HINTS: list[tuple[str, str]] = [
    ("sodium caseinate", "milk"),
    ("calcium caseinate", "milk"),
    ("caseinate", "milk"),
    ("casein", "milk"),
    ("whey", "milk"),
    ("lactose", "milk"),
    ("milk", "milk"),
    ("butter", "milk"),
    ("cream", "milk"),
    ("cheese", "milk"),
    ("yogurt", "milk"),
    ("yoghurt", "milk"),
    ("ghee", "milk"),
    ("egg white", "egg"),
    ("egg yolk", "egg"),
    ("ovalbumin", "egg"),
    ("albumin", "egg"),
    ("lysozyme", "egg"),
    ("egg", "egg"),
    ("mayonnaise", "egg"),
    ("peanut", "peanut"),
    ("arachis", "peanut"),
    ("groundnut", "peanut"),
    ("almond", "tree_nuts"),
    ("cashew", "tree_nuts"),
    ("walnut", "tree_nuts"),
    ("hazelnut", "tree_nuts"),
    ("pistachio", "tree_nuts"),
    ("pecan", "tree_nuts"),
    ("macadamia", "tree_nuts"),
    ("brazil nut", "tree_nuts"),
    ("pine nut", "tree_nuts"),
    ("tree nut", "tree_nuts"),
    ("soy lecithin", "soy"),
    ("soya", "soy"),
    ("soybean", "soy"),
    ("soy", "soy"),
    ("tofu", "soy"),
    ("edamame", "soy"),
    ("miso", "soy"),
    ("tempeh", "soy"),
    ("wheat", "wheat"),
    ("gluten", "wheat"),
    ("barley", "wheat"),
    ("rye", "wheat"),
    ("malt", "wheat"),
    ("semolina", "wheat"),
    ("spelt", "wheat"),
    ("seitan", "wheat"),
    ("anchovy", "fish"),
    ("fish sauce", "fish"),
    ("surimi", "fish"),
    ("fish", "fish"),
    ("shrimp", "shellfish"),
    ("prawn", "shellfish"),
    ("crab", "shellfish"),
    ("lobster", "shellfish"),
    ("shellfish", "shellfish"),
    ("sesame", "sesame"),
    ("tahini", "sesame"),
    ("mustard", "mustard"),
    ("celery", "celery"),
    ("sulphite", "sulphites"),
    ("sulfite", "sulphites"),
    ("sulphur dioxide", "sulphites"),
    ("sulfur dioxide", "sulphites"),
]

# Token → diet feature
DIET_HINTS: list[tuple[str, str]] = [
    ("high fructose corn syrup", "diabetes"),
    ("glucose syrup", "diabetes"),
    ("corn syrup", "diabetes"),
    ("maltodextrin", "diabetes"),
    ("dextrose", "diabetes"),
    ("sucrose", "diabetes"),
    ("fructose", "diabetes"),
    ("glucose", "diabetes"),
    ("sugar", "diabetes"),
    ("honey", "diabetes"),
    ("lactose", "lactose"),
    ("milk", "lactose"),
    ("whey", "lactose"),
    ("casein", "lactose"),
    ("cream", "lactose"),
    ("butter", "lactose"),
    ("cheese", "lactose"),
    ("yogurt", "lactose"),
    ("wheat", "celiac"),
    ("gluten", "celiac"),
    ("barley", "celiac"),
    ("rye", "celiac"),
    ("malt", "celiac"),
    ("sodium chloride", "hypertension"),
    ("sea salt", "hypertension"),
    ("table salt", "hypertension"),
    ("salt", "hypertension"),
    ("msg", "hypertension"),
    ("monosodium glutamate", "hypertension"),
    ("soy sauce", "hypertension"),
    ("palm oil", "heart"),
    ("hydrogenated", "heart"),
    ("lard", "heart"),
    ("sodium phosphate", "kidney"),
    ("potassium chloride", "kidney"),
    ("inulin", "ibs"),
    ("sorbitol", "ibs"),
    ("mannitol", "ibs"),
    ("xylitol", "ibs"),
    ("maltitol", "ibs"),
    ("onion", "ibs"),
    ("garlic", "ibs"),
]

DIET_EFFECT_COPY = {
    "diabetes": "Can raise blood sugar; watch portions if you manage diabetes.",
    "lactose": "May contain lactose or milk sugar; relevant for lactose intolerance.",
    "celiac": "May contain gluten or gluten grains; not suitable for celiac disease.",
    "hypertension": "May add sodium; relevant if you manage high blood pressure.",
    "heart": "May raise saturated fat or sodium load for heart-aware eating.",
    "kidney": "May add sodium, potassium, or phosphate load for kidney diets.",
    "ibs": "Possible IBS trigger for some people; tolerance varies.",
}

ALLERGEN_EFFECT_COPY = {
    "milk": "Contains or may contain milk proteins — avoid if you have a milk/dairy allergy.",
    "egg": "Contains or may contain egg — avoid if you have an egg allergy.",
    "peanut": "Contains or may contain peanut — high-priority allergen.",
    "tree_nuts": "Contains or may contain tree nuts — avoid if you have a tree-nut allergy.",
    "soy": "Contains or may contain soy — avoid if you have a soy allergy.",
    "wheat": "Contains or may contain wheat/gluten grains — avoid if you have a wheat allergy.",
    "fish": "Contains or may contain fish — avoid if you have a fish allergy.",
    "shellfish": "Contains or may contain shellfish — avoid if you have a shellfish allergy.",
    "sesame": "Contains or may contain sesame — avoid if you have a sesame allergy.",
    "mustard": "Contains or may contain mustard — relevant for mustard allergy.",
    "celery": "Contains or may contain celery — relevant for celery allergy.",
    "sulphites": "Contains or may contain sulphites — can trigger sulphite sensitivity.",
}


def _norm(text: str) -> str:
    value = (text or "").lower().strip()
    value = value.replace("–", "-").replace("—", "-")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _pipe(values: set[str]) -> str:
    return "|".join(sorted(values))


def _detect(text: str, hints: list[tuple[str, str]], allowed: set[str]) -> set[str]:
    hay = f" {_norm(text)} "
    found: set[str] = set()
    for token, flag in sorted(hints, key=lambda item: len(item[0]), reverse=True):
        if flag not in allowed:
            continue
        needle = f" {_norm(token)} "
        if needle in hay or _norm(token) == _norm(text):
            found.add(flag)
    return found


def _effects_for(allergens: set[str], diets: set[str], existing: str, category: str) -> str:
    existing = (existing or "").strip()
    # Keep curated notes; replace only empty / generic expand stubs.
    generic = (
        not existing
        or "tap ai research" in existing.lower()
        or existing.lower().startswith("effects depend on the exact ingredient")
        or existing.lower().startswith("a food-label ingredient phrase")
    )
    if not generic:
        return existing

    parts: list[str] = []
    for key in sorted(allergens):
        parts.append(ALLERGEN_EFFECT_COPY.get(key, f"May relate to {key.replace('_', ' ')} allergy."))
    for key in sorted(diets):
        parts.append(DIET_EFFECT_COPY.get(key, f"May matter for {key}."))
    if parts:
        return " ".join(parts[:3])
    if category:
        return f"Common {category} ingredient. Confirm the package if you are sensitive."
    return "Confirm the package label if you are unsure or sensitive."


def enrich_knowledge() -> int:
    with KNOWLEDGE.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    out: list[dict] = []
    for raw in rows:
        name = (raw.get("ingredient_name") or "").strip()
        if not name:
            continue
        aliases = (raw.get("aliases") or "").strip()
        category = (raw.get("category") or "").strip()
        blob = f"{name} {aliases} {category} {raw.get('what_it_is') or ''}"
        allergens = _detect(blob, ALLERGEN_HINTS, ALLERGEN_KEYS)
        diets = _detect(blob, DIET_HINTS, DIET_KEYS)
        # Category shortcuts
        cat = category.lower()
        if "sweetener" in cat or "sugar" in cat:
            diets.add("diabetes")
        if "seasoning" in cat and "salt" in _norm(name):
            diets.add("hypertension")

        effects = _effects_for(allergens, diets, raw.get("possible_effects") or "", category)
        out.append(
            {
                "ingredient_name": name,
                "aliases": aliases,
                "category": category,
                "what_it_is": (raw.get("what_it_is") or "").strip(),
                "commonly_seen_in": (raw.get("commonly_seen_in") or "").strip(),
                "possible_effects": effects,
                "affects_allergens": _pipe(allergens),
                "affects_diets": _pipe(diets),
                "source": (raw.get("source") or "").strip(),
            }
        )

    fieldnames = [
        "ingredient_name",
        "aliases",
        "category",
        "what_it_is",
        "commonly_seen_in",
        "possible_effects",
        "affects_allergens",
        "affects_diets",
        "source",
    ]
    with KNOWLEDGE.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out)
    flagged = sum(1 for row in out if row["affects_allergens"] or row["affects_diets"])
    print(f"knowledge: {len(out)} rows, {flagged} with feature flags")
    return len(out)


def enrich_allergens() -> int:
    with ALLERGENS.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    out: list[dict] = []
    for raw in rows:
        name = (raw.get("ingredient_name") or "").strip()
        if not name:
            continue
        category = (raw.get("allergen_category") or "").strip().lower().replace(" ", "_")
        if category == "treenuts":
            category = "tree_nuts"
        allergens = {category} if category in ALLERGEN_KEYS else set()
        diets: set[str] = set()
        if category == "milk":
            diets.add("lactose")
        if category == "wheat":
            diets.add("celiac")
        plain = (raw.get("plain_explanation") or "").strip()
        effects = _effects_for(allergens, diets, plain, category)
        out.append(
            {
                "ingredient_name": name,
                "aliases": (raw.get("aliases") or "").strip(),
                "allergen_category": category or (raw.get("allergen_category") or "").strip(),
                "affects_allergens": _pipe(allergens),
                "affects_diets": _pipe(diets),
                "possible_effects": effects,
                "source": (raw.get("source") or "").strip(),
                "plain_explanation": plain or effects,
                "verified": (raw.get("verified") or "false").strip().lower(),
            }
        )

    fieldnames = [
        "ingredient_name",
        "aliases",
        "allergen_category",
        "affects_allergens",
        "affects_diets",
        "possible_effects",
        "source",
        "plain_explanation",
        "verified",
    ]
    with ALLERGENS.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out)
    print(f"allergens: {len(out)} rows enriched with effects + flags")
    return len(out)


if __name__ == "__main__":
    enrich_knowledge()
    enrich_allergens()
