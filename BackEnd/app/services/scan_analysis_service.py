"""Run allergy matching, Nutri-Score, and the AI explainer for a scan."""

from __future__ import annotations

from app.core.repo_path import ensure_repo_root
from app.services.explanation_service import explain_scan
from app.services.nutriscore_service import nutri_score_grade

ensure_repo_root()

from ai.allergy_engine import check_allergies, compute_safety_score, overall_verdict


def analyze_ingredients(
    ingredients: list[str],
    user_allergies: list[str] | None = None,
    nutrition: dict | None = None,
) -> dict:
    flags = check_allergies(user_allergies or [], ingredients)
    verdict = overall_verdict(flags)
    safety_score = compute_safety_score(flags)
    flagged = [item for item in flags if item.get("status") in {"avoid", "caution"}]
    grade = nutri_score_grade(nutrition)
    nutrition_result = (
        {"grade": grade, "status": "ok"}
        if grade
        else {"grade": None, "status": "incomplete_nutrition_data"}
    )
    allergy_result = {
        "flagged_ingredients": flagged,
        "match_occurred": any(item.get("status") == "avoid" for item in flags),
        "incomplete": any(item.get("status") == "caution" for item in flags),
        "severity": verdict,
        "safety_score": safety_score,
    }
    explanation = explain_scan(allergy_result, nutrition_result if grade else None, verdict.capitalize())
    return {
        # Only confirmed allergy hits belong in allergy_flags. Unmapped
        # ingredients stay "caution" in allergy_matches for review, but must
        # not be listed as allergens in the UI.
        "allergy_flags": [
            item["ingredient"]
            for item in flags
            if item.get("status") == "avoid" and item.get("ingredient")
        ],
        "allergy_matches": flags,
        "verdict": verdict,
        "safety_score": safety_score,
        "nutri_score_grade": grade,
        "explanation": explanation,
    }
