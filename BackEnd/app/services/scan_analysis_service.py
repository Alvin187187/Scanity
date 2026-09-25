"""Run allergy matching, condition checks, Nutri-Score, and AI explainer."""

from __future__ import annotations

from app.core.repo_path import ensure_repo_root
from app.services.explanation_service import explain_scan
from app.services.nutriscore_service import nutri_score_grade

ensure_repo_root()

from ai.allergy_engine import check_allergies, compute_safety_score, overall_verdict
from ai.condition_engine import apply_condition_rules
from ai.gemini_client import last_ai_status
from seed.ingredient_knowledge_loader import enrich_flag_with_knowledge, lookup_ingredient_knowledge


def _label_insights(ingredients: list[str], flags: list[dict] | None = None) -> list[dict]:
    insights: list[dict] = []
    seen: set[str] = set()

    # Prefer flagged / avoid first so chips the shopper cares about are covered.
    ordered_names: list[str] = []
    for item in flags or []:
        name = str(item.get("ingredient") or "").strip()
        if name:
            ordered_names.append(name)
    for name in ingredients or []:
        if name not in ordered_names:
            ordered_names.append(name)

    for name in ordered_names:
        knowledge = lookup_ingredient_knowledge(name)
        if not knowledge:
            # Still expose a chip stub so the UI can open AI RAG fallback.
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            insights.append(
                {
                    "ingredient": name,
                    "title": name,
                    "category": "",
                    "what_it_is": "",
                    "commonly_seen_in": "",
                    "possible_effects": "",
                    "affects_allergens": [],
                    "affects_diets": [],
                    "source": "",
                    "aliases": [],
                    "needs_ai": True,
                }
            )
        else:
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
                    "affects_allergens": knowledge.get("affects_allergens") or [],
                    "affects_diets": knowledge.get("affects_diets") or [],
                    "source": knowledge["source"],
                    "aliases": knowledge["aliases"],
                    "needs_ai": False,
                }
            )
        if len(insights) >= 40:
            break
    return insights


def analyze_ingredients(
    ingredients: list[str],
    user_allergies: list[str] | None = None,
    nutrition: dict | None = None,
    user_conditions: list[str] | None = None,
    *,
    use_hosted_ai: bool = False,
    nutri_score_hint: str | None = None,
) -> dict:
    flags = [
        enrich_flag_with_knowledge(item)
        for item in check_allergies(user_allergies or [], ingredients)
    ]
    flags = apply_condition_rules(flags, user_conditions, nutrition)
    flags = [enrich_flag_with_knowledge(item) for item in flags]

    verdict = overall_verdict(flags)
    safety_score = compute_safety_score(
        flags,
        conditions=user_conditions,
        nutrition=nutrition,
    )
    flagged = [item for item in flags if item.get("status") in {"avoid", "caution"}]
    grade = nutri_score_grade(nutrition, hint=nutri_score_hint)
    nutrition_result = (
        {"grade": grade, "status": "ok", "nutrition": nutrition or {}}
        if grade
        else {
            "grade": None,
            "status": "incomplete_nutrition_data",
            "nutrition": nutrition or {},
        }
    )
    allergy_result = {
        "flagged_ingredients": flagged,
        "match_occurred": any(item.get("status") == "avoid" for item in flags),
        "incomplete": any(item.get("status") == "caution" for item in flags),
        "severity": verdict,
        "safety_score": safety_score,
        "conditions": user_conditions or [],
    }
    # Scan path stays fast: rules decide verdict/score; Gemini is for chat/chips.
    explanation = explain_scan(
        allergy_result,
        nutrition_result if (grade or nutrition) else None,
        verdict.capitalize(),
        use_hosted_ai=use_hosted_ai,
    )
    ai_status = last_ai_status() if use_hosted_ai else {"source": "template", "detail": "scan_fast_path"}
    return {
        "allergy_flags": [
            item["ingredient"]
            for item in flags
            if item.get("status") == "avoid" and item.get("ingredient")
        ],
        "allergy_matches": flags,
        "label_insights": _label_insights(ingredients, flags),
        "verdict": verdict,
        "safety_score": safety_score,
        "nutri_score_grade": grade,
        "explanation": explanation,
        "ai_source": ai_status.get("source") or "template",
        "ai_detail": ai_status.get("detail") or "",
        "profile_applied": {
            "allergies": user_allergies or [],
            "conditions": user_conditions or [],
        },
    }
