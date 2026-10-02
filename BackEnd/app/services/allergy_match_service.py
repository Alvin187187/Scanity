"""
Engine 1 of 3 for Issue #153 - Allergy Matching.
Compares a user's stored allergies against a list of ingredient names.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.schema import AllergyType, user_allergies

def match_allergies(db: Session, user_id, ingredient_names: list[str]) -> dict:
    """
    Returns which of the user's known allergies appear in the given
    ingredient list, using a case-insensitive substring match.
    """
    rows = db.execute(
        select(AllergyType.allergen_name, user_allergies.c.severity)
        .join(user_allergies, user_allergies.c.allergy_type_id == AllergyType.allergy_type_id)
        .where(user_allergies.c.user_id == user_id)
    ).all()

    if not rows:
        return {"flagged": [], "matched_ingredients": [], "has_match": False, "severity_max": None}

    user_allergens = {r.allergen_name.lower(): r.severity for r in rows}
    ingredients_lower = [name.lower() for name in ingredient_names]

    flagged = []
    matched_ingredients = []
    severities_hit = []

    for allergen_name, severity in user_allergens.items():
        for i, ingredient in enumerate(ingredients_lower):
            if allergen_name in ingredient:
                flagged.append(allergen_name)
                matched_ingredients.append(ingredient_names[i])
                severities_hit.append(severity)
                break

    severity_rank = {"severe": 3, "moderate": 2, "mild": 1}
    severity_max = None
    if severities_hit:
        severity_max = max(severities_hit, key=lambda s: severity_rank.get(s, 0)) if any(severities_hit) else None

    return {
        "flagged": flagged,
        "matched_ingredients": matched_ingredients,
        "has_match": len(flagged) > 0,
        "severity_max": severity_max,
    }