"""Run allergy matching, Nutri-Score, and the AI explainer for a scan."""

from __future__ import annotations

from app.core.repo_path import ensure_repo_root
from app.services.explanation_service import explain_scan
from app.services.nutriscore_service import nutri_score_grade

ensure_repo_root()

from ai.allergy_engine import check_allergies, compute_safety_score, overall_verdict
from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai, last_ai_status
from seed.ingredient_knowledge_loader import enrich_flag_with_knowledge, lookup_ingredient_knowledge


def _label_insights(ingredients: list[str]) -> list[dict]:
    insights: list[dict] = []
    seen: set[str] = set()
    for name in ingredients or []:
        knowledge = lookup_ingredient_knowledge(name)
        if not knowledge:
            continue
        key = knowledge["ingredient_name"].lower()
        if key in seen:
            continue
        seen.add(key)
        insights.append(
            {
                "ingredient": name,
                "title": knowledge["ingredient_name"],
                "category": knowledge["category"],
                "what_it_is": knowledge["what_it_is"],
                "commonly_seen_in": knowledge["commonly_seen_in"],
                "possible_effects": knowledge["possible_effects"],
                "source": knowledge["source"],
                "aliases": knowledge["aliases"],
            }
        )
        if len(insights) >= 12:
            break
    return insights


def analyze_ingredients(
    ingredients: list[str],
    user_allergies: list[str] | None = None,
    nutrition: dict | None = None,
) -> dict:
    flags = [
        enrich_flag_with_knowledge(item)
        for item in check_allergies(user_allergies or [], ingredients)
    ]
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
    explanation = explain_scan(
        allergy_result,
        nutrition_result if grade else None,
        verdict.capitalize(),
    )
    ai_status = last_ai_status()
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
        "label_insights": _label_insights(ingredients),
        "verdict": verdict,
        "safety_score": safety_score,
        "nutri_score_grade": grade,
        "explanation": explanation,
        "ai_source": ai_status.get("source") or "template",
        "ai_detail": ai_status.get("detail") or "",
    }
