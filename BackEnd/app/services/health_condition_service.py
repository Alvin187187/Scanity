"""
Engine 2 of 3 for Issue #153 - Health Condition Warnings.
Evaluates nutritional thresholds against stored nutrition rules.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.schema import user_health_conditions, NutritionRule

def check_health_conditions(db: Session, user_id, nutrition_data: dict) -> dict:
    condition_ids = db.execute(
        select(user_health_conditions.c.condition_type_id)
        .where(user_health_conditions.c.user_id == user_id)
    ).scalars().all()

    if not condition_ids:
        return {"violations": [], "has_violation": False}

    rules = db.execute(select(NutritionRule)).scalars().all()

    violations = []
    for rule in rules:
        val = nutrition_data.get(rule.nutrient)
        if val is None:
            continue

        if val > rule.limit_value:
            violations.append(rule.description or rule.rule_name or "Warning threshold exceeded")

    return {"violations": violations, "has_violation": len(violations) > 0}

