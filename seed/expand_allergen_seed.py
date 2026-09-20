"""
seed/expand_allergen_seed.py

Expand seed_allergens.csv using the 10k allergen phrase dataset so matching
covers thousands of real label phrases (target: 5k–10k rows).
"""

from __future__ import annotations

import ast
import csv
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BASE_SEED = Path(__file__).parent / "seed_allergens.csv"
SOURCE_10K = REPO / "BackEnd" / "Seed data" / "Allergens" / "Allergen_Datasets - allergies_10k.csv"
SOURCE_FOOD = (
    REPO
    / "BackEnd"
    / "Seed data"
    / "Allergens"
    / "Allergen_Datasets - food_ingredients_and_allergens.csv"
)
OUT_SEED = Path(__file__).parent / "seed_allergens.csv"

CATEGORY_MAP = {
    "dairy": "milk",
    "milk": "milk",
    "lactose": "milk",
    "butter": "milk",
    "cheese": "milk",
    "cream": "milk",
    "yogurt": "milk",
    "yoghurt": "milk",
    "eggs": "egg",
    "egg": "egg",
    "peanuts": "peanut",
    "peanut": "peanut",
    "tree nuts": "tree_nuts",
    "tree nut": "tree_nuts",
    "almonds": "tree_nuts",
    "almond": "tree_nuts",
    "walnuts": "tree_nuts",
    "walnut": "tree_nuts",
    "cashews": "tree_nuts",
    "cashew": "tree_nuts",
    "hazelnuts": "tree_nuts",
    "hazelnut": "tree_nuts",
    "pistachios": "tree_nuts",
    "pistachio": "tree_nuts",
    "pecans": "tree_nuts",
    "pecan": "tree_nuts",
    "soybeans": "soy",
    "soy": "soy",
    "soya": "soy",
    "wheat": "wheat",
    "gluten": "wheat",
    "fish": "fish",
    "shellfish": "shellfish",
    "shrimp": "shellfish",
    "crab": "shellfish",
    "lobster": "shellfish",
    "sesame": "sesame",
    "mustard": "mustard",
    "celery": "celery",
    "sulphites": "sulphites",
    "sulfites": "sulphites",
    "sulphur dioxide": "sulphites",
    "sulfur dioxide": "sulphites",
}


def _clean_tag(tag: str) -> str:
    return re.sub(r"^\*+", "", (tag or "").strip().lower()).strip()


def _normalize_name(text: str) -> str:
    value = (text or "").strip()
    value = re.sub(r"\s+", " ", value)
    return value[:180]


def _parse_allergens(raw: str) -> list[str]:
    try:
        tags = ast.literal_eval(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    if not isinstance(tags, list):
        return []
    out: list[str] = []
    for tag in tags:
        mapped = CATEGORY_MAP.get(_clean_tag(str(tag)))
        if mapped and mapped not in out:
            out.append(mapped)
    return out


def _load_base() -> list[dict]:
    rows: list[dict] = []
    with BASE_SEED.open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            name = _normalize_name(raw.get("ingredient_name") or "")
            if not name:
                continue
            rows.append(
                {
                    "ingredient_name": name,
                    "aliases": (raw.get("aliases") or "").strip(),
                    "allergen_category": (raw.get("allergen_category") or "").strip(),
                    "source": (raw.get("source") or "").strip() or "curated seed",
                    "plain_explanation": (raw.get("plain_explanation") or "").strip(),
                    "verified": (raw.get("verified") or "false").strip().lower(),
                }
            )
    return rows


def _add_row(
    base: list[dict],
    seen: set[str],
    ingredient: str,
    category: str,
    source: str,
    aliases: str = "",
) -> bool:
    name = _normalize_name(ingredient)
    if not name or len(name) < 3:
        return False
    key = name.lower()
    if key in seen:
        return False
    seen.add(key)
    alias_text = aliases.strip()
    if not alias_text:
        parts = [
            _normalize_name(part)
            for part in re.split(r"[,;/]| and | with |\(|\)", name)
            if _normalize_name(part)
        ]
        alias_parts = []
        for part in parts:
            if part.lower() == key or len(part) < 4 or len(part) > 80:
                continue
            if part.count(" ") > 5:
                continue
            alias_parts.append(part)
        alias_text = " | ".join(alias_parts[:8])
    base.append(
        {
            "ingredient_name": name,
            "aliases": alias_text,
            "allergen_category": category,
            "source": source,
            "plain_explanation": (
                f"Label phrase associated with {category.replace('_', ' ')} "
                f"allergy risk in food-ingredient datasets."
            ),
            "verified": "false",
        }
    )
    return True


def _split_phrase_parts(phrase: str) -> list[str]:
    parts = re.split(r"[,;/]| and | with |\(|\)", phrase)
    out: list[str] = []
    for part in parts:
        token = _normalize_name(part)
        if 3 <= len(token) <= 80 and token.count(" ") <= 6:
            out.append(token)
    return out


def expand() -> int:
    base = _load_base()
    seen = {row["ingredient_name"].lower() for row in base}
    added = 0

    if SOURCE_10K.is_file():
        with SOURCE_10K.open(encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                ingredient = _normalize_name(raw.get("ingredient") or "")
                categories = _parse_allergens(raw.get("allergens") or "[]")
                if not categories:
                    continue
                category = categories[0]
                if _add_row(base, seen, ingredient, category, "allergies_10k.csv"):
                    added += 1
                for part in _split_phrase_parts(ingredient):
                    # Only keep sub-phrases that are themselves known allergen terms.
                    mapped = CATEGORY_MAP.get(part.lower())
                    if mapped and _add_row(base, seen, part, mapped, "allergies_10k.csv:token"):
                        added += 1

    if SOURCE_FOOD.is_file():
        with SOURCE_FOOD.open(encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                allergen_raw = raw.get("Allergens") or ""
                tags = [_clean_tag(t) for t in re.split(r"[,/]", allergen_raw) if t.strip()]
                for tag in tags:
                    mapped = CATEGORY_MAP.get(tag)
                    if mapped and _add_row(base, seen, tag, mapped, "food_ingredients_and_allergens.csv:tag"):
                        added += 1
                for field in ("Main Ingredient", "Seasoning", "Fat/Oil"):
                    value = _normalize_name(raw.get(field) or "")
                    if not value or value.lower() in {"none", "n/a", "na"}:
                        continue
                    mapped = CATEGORY_MAP.get(value.lower())
                    if mapped and _add_row(base, seen, value, mapped, "food_ingredients_and_allergens.csv"):
                        added += 1

    fieldnames = [
        "ingredient_name",
        "aliases",
        "allergen_category",
        "source",
        "plain_explanation",
        "verified",
    ]
    with OUT_SEED.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(base)

    print(f"Wrote {len(base)} rows to {OUT_SEED} (+{added} expanded)")
    return len(base)


if __name__ == "__main__":
    expand()
