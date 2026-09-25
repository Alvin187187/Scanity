"""Approximate Nutri-Score grade from per-100g nutrients.

Issue #171. This is independent of allergy matching — a product can be
Grade A and still be Avoid for a specific shopper.
"""

from __future__ import annotations


def nutri_score_grade(nutrition: dict | None, hint: str | None = None) -> str | None:
    """Return A–E, or None when there is not enough nutrient data.

    Prefer an official Open Food Facts Nutri-Score when one is supplied.
    Energy may be kJ or kcal — many OFF products only ship kcal.
    """
    hint_grade = str(hint or "").strip().lower()[:1]
    if hint_grade in {"a", "b", "c", "d", "e"}:
        return hint_grade

    if not nutrition:
        return None

    sugars = _num(nutrition.get("sugars_g") or nutrition.get("sugars100g") or nutrition.get("sugars"))
    sat_fat = _num(
        nutrition.get("sat_fat_g")
        or nutrition.get("saturatedFat100g")
        or nutrition.get("saturated-fat_100g")
    )
    sodium_mg = _num(nutrition.get("sodium_mg") or nutrition.get("sodium100g"))
    if sodium_mg is not None and sodium_mg <= 5:
        # Open Food Facts stores sodium in grams; barcode mapping already
        # converts to mg when possible. Values this small are treated as grams.
        sodium_mg = sodium_mg * 1000
    fiber = _num(nutrition.get("fiber_g") or nutrition.get("fiber100g") or nutrition.get("fiber"))
    protein = _num(nutrition.get("protein_g") or nutrition.get("proteins100g") or nutrition.get("proteins"))
    energy_kj = _num(nutrition.get("energy_kj") or nutrition.get("energyKj100g"))
    if energy_kj is None:
        kcal = _num(
            nutrition.get("energy_kcal")
            or nutrition.get("energyKcal100g")
            or nutrition.get("energy-kcal_100g")
        )
        if kcal is not None:
            energy_kj = kcal * 4.184

    present = [value for value in (sugars, sat_fat, sodium_mg, fiber, protein, energy_kj) if value is not None]
    if len(present) < 3:
        return None

    points = 0
    if energy_kj is not None:
        points += 0 if energy_kj < 335 else 1 if energy_kj < 670 else 2 if energy_kj < 1005 else 3 if energy_kj < 1340 else 4
    if sugars is not None:
        points += 0 if sugars < 4.5 else 1 if sugars < 9 else 2 if sugars < 13.5 else 3 if sugars < 18 else 4
    if sat_fat is not None:
        points += 0 if sat_fat < 1 else 1 if sat_fat < 2 else 2 if sat_fat < 3 else 3 if sat_fat < 4 else 4
    if sodium_mg is not None:
        points += 0 if sodium_mg < 90 else 1 if sodium_mg < 180 else 2 if sodium_mg < 270 else 3 if sodium_mg < 360 else 4
    if fiber is not None:
        points -= 0 if fiber < 0.9 else 1 if fiber < 1.9 else 2 if fiber < 2.8 else 3
    if protein is not None:
        points -= 0 if protein < 1.6 else 1 if protein < 3.2 else 2 if protein < 4.8 else 3

    if points <= -1:
        return "a"
    if points <= 2:
        return "b"
    if points <= 10:
        return "c"
    if points <= 18:
        return "d"
    return "e"


def _num(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
