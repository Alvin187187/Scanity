"""
Engine 2 of 3 for Issue #153 - Health Condition Thresholds.
Checks a product's nutrition values against rules tied to the user's
health conditions (e.g. diabetes -> flag high sugar). Feeds into the
overall scan verdict alongside Engine 1 (allergy matching).
Independent of Nutri-Score (Engine 3).
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.schema import HealthConditionType, NutritionRule, user_health_conditions

_OPERATORS = {
    ">": lambda value, threshold: value > threshold,
    ">=": lambda value, threshold: value >= threshold,
    "<": lambda value, threshold: value < threshold,
    "<=": lambda value, threshold: value <= threshold,
}

def check_health_conditions(db: Session, user_id, nutrition_data: dict) -> dict:
    # Fetch this user's health conditions
    condition_ids = db.execute(
        select(user_health_conditions.c.condition_type_id)
        .where(user_health_conditions.c.user_id == user_id)
    ).scalars().all()

    if not condition_ids:
        return {"violations": [], "has_violation": False}

    # Fetch all rules tied to any of this user's conditions
    rules = db.execute(
        select(NutritionRule).where(NutritionRule.condition_type_id.in_(condition_ids))
    ).scalars().all()

    violations = []
    for rule in rules:
        value = nutrition_data.get(rule.nutrient_name)
        if value is None:
            continue  # can't evaluate a rule without the matching nutrient data present

        compare_fn = _OPERATORS.get(rule.operator)
        if compare_fn is None:
            continue  # unrecognized operator - skip rather than crash

        if compare_fn(value, rule.threshold_value):
            violations.append({
                "nutrient_name": rule.nutrient_name,
                "value": value,
                "threshold": rule.threshold_value,
                "operator": rule.operator,
                "reason": rule.recommendation_reason,
            })

    return {"violations": violations, "has_violation": len(violations) > 0}