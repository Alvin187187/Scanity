"""
Engine 3 of 3 for Issue #153 - Nutri-Score Calculation.
Purely computes an A-E grade from raw nutrition facts. Independent of the
user profile entirely — same product, same grade, regardless of who scans it.

NOTE: Implements the simplified 2017-version Nutri-Score point tables
(solid food vs. beverage split). The official 2023 algorithm has additional
category-specific tables (cheese, fats/oils, etc.) not implemented here —
a reasonable approximation for this project's scope, flagged for anyone who
needs spec-exact compliance later.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Nutriments:
    energy_kj: float
    sugars_g: float
    sat_fat_g: float
    sodium_mg: float
    fiber_g: float
    proteins_g: float
    fruits_veg_nuts_pct: float
    incomplete_data: bool = False  # True if any mandatory field was missing and defaulted to 0


def parse_off_nutriments(product_payload: dict) -> Nutriments:
    """
    Extracts and standardizes per-100g nutriments from an OpenFoodFacts
    product payload into the Nutriments shape calculate_nutri_score expects.
    """
    nutriments = product_payload.get("nutriments", {})
    incomplete = False

    def _get(key: str, fallback_key: Optional[str] = None) -> float:
        nonlocal incomplete
        value = nutriments.get(key)
        if value is None and fallback_key:
            value = nutriments.get(fallback_key)
        if value is None:
            incomplete = True
            return 0.0
        return float(value)

    sodium_mg = nutriments.get("sodium_100g")
    if sodium_mg is not None:
        sodium_mg = float(sodium_mg) * 1000
    elif "salt_100g" in nutriments:
        sodium_mg = (float(nutriments["salt_100g"]) / 2.5) * 1000
    else:
        sodium_mg = 0.0
        incomplete = True

    fruits_veg_nuts_pct = nutriments.get("fruits-vegetables-nuts-estimate-from-ingredients_100g")
    if fruits_veg_nuts_pct is None:
        fruits_veg_nuts_pct = 0.0

    return Nutriments(
        energy_kj=_get("energy-kj_100g", "energy_100g"),
        sugars_g=_get("sugars_100g"),
        sat_fat_g=_get("saturated-fat_100g"),
        sodium_mg=sodium_mg,
        fiber_g=_get("fiber_100g"),
        proteins_g=_get("proteins_100g"),
        fruits_veg_nuts_pct=float(fruits_veg_nuts_pct),
        incomplete_data=incomplete,
    )


def is_beverage(category: Optional[str]) -> bool:
    """Basic keyword heuristic - defaults to solid food if category is missing/ambiguous."""
    if not category:
        return False
    category_lower = category.lower()
    return any(kw in category_lower for kw in ["beverage", "drink", "juice", "soda"])


def _energy_points(kj: float, beverage: bool) -> int:
    thresholds = [0, 30, 90, 150, 210, 240, 270, 300, 330, 360] if beverage else \
                 [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]
    for i, t in enumerate(thresholds):
        if kj <= t:
            return i
    return 10


def _sugar_points(sugars: float, beverage: bool) -> int:
    thresholds = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5] if beverage else \
                 [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]
    for i, t in enumerate(thresholds):
        if sugars <= t:
            return i
    return 10


def _sat_fat_points(sat_fat: float) -> int:
    thresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for i, t in enumerate(thresholds):
        if sat_fat <= t:
            return i
    return 10


def _sodium_points(sodium_mg: float) -> int:
    thresholds = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]
    for i, t in enumerate(thresholds):
        if sodium_mg <= t:
            return i
    return 10


def _fruits_veg_nuts_points(pct: float, beverage: bool) -> int:
    if beverage:
        if pct > 80:
            return 10
        if pct > 60:
            return 4
        if pct > 40:
            return 2
        return 0
    if pct > 80:
        return 5
    if pct > 60:
        return 2
    if pct > 40:
        return 1
    return 0


def _fiber_points(fiber: float) -> int:
    thresholds = [0.9, 1.9, 2.8, 3.7, 4.7]
    for i, t in enumerate(thresholds):
        if fiber <= t:
            return i
    return 5


def _protein_points(protein: float) -> int:
    thresholds = [1.6, 3.2, 4.8, 6.4, 8.0]
    for i, t in enumerate(thresholds):
        if protein <= t:
            return i
    return 5


def _map_score_to_grade(score: int, beverage: bool) -> str:
    if beverage:
        if score <= 1:
            return "A"
        if score <= 5:
            return "B"
        if score <= 9:
            return "C"
        if score <= 13:
            return "D"
        return "E"
    if score <= -1:
        return "A"
    if score <= 2:
        return "B"
    if score <= 10:
        return "C"
    if score <= 18:
        return "D"
    return "E"


def calculate_nutri_score(nutrients: Nutriments, is_beverage_flag: bool = False) -> dict:
    """
    Calculates a Nutri-Score A-E grade from standardized per-100g nutrition data.
    Pure function — no DB or network calls, fully unit-testable in isolation.
    """
    n_points = (
        _energy_points(nutrients.energy_kj, is_beverage_flag)
        + _sugar_points(nutrients.sugars_g, is_beverage_flag)
        + _sat_fat_points(nutrients.sat_fat_g)
        + _sodium_points(nutrients.sodium_mg)
    )

    p_points = (
        _fruits_veg_nuts_points(nutrients.fruits_veg_nuts_pct, is_beverage_flag)
        + _fiber_points(nutrients.fiber_g)
        + _protein_points(nutrients.proteins_g)
    )

    fvn_points = _fruits_veg_nuts_points(nutrients.fruits_veg_nuts_pct, is_beverage_flag)
    if n_points >= 11 and fvn_points < (10 if is_beverage_flag else 5):
        effective_p = p_points - _protein_points(nutrients.proteins_g)
    else:
        effective_p = p_points

    score = n_points - effective_p
    grade = _map_score_to_grade(score, is_beverage_flag)

    return {
        "nutri_score_grade": grade,
        "numerical_score": score,
        "negative_points": n_points,
        "positive_points": p_points,
        "incomplete_data": nutrients.incomplete_data,
    }