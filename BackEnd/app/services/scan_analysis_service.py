"""Run allergy matching, condition checks, Nutri-Score, and AI explainer."""

from __future__ import annotations

from app.core.repo_path import ensure_repo_root
from app.services.explanation_service import explain_scan
from app.services.nutriscore_service import nutri_score_grade

ensure_repo_root()

from ai.allergy_engine import apply_declared_allergens, check_allergies, overall_verdict
from ai.condition_engine import apply_condition_rules, explain_personalized_score
from ai.gemini_client import last_ai_status
from seed.ingredient_knowledge_loader import (
    _row_names_this_ingredient,
    chip_title,
    clean_ingredient_label,
    enrich_flag_with_knowledge,
    is_placeholder_copy,
    lookup_ingredient_knowledge,
    shopper_definition,
)


def _present_ingredients(ingredients: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in ingredients or []:
        name = clean_ingredient_label(str(raw or ""))
        if len(name) < 2:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name)
    return cleaned


def _label_insights(ingredients: list[str], flags: list[dict] | None = None) -> list[dict]:
    insights: list[dict] = []
    seen: set[str] = set()
    flag_by_name = {
        str(item.get("ingredient") or "").strip().lower(): item
        for item in (flags or [])
        if str(item.get("ingredient") or "").strip()
    }

    # Prefer flagged / avoid first so chips the shopper cares about are covered.
    ordered_names: list[str] = []
    for item in flags or []:
        name = clean_ingredient_label(str(item.get("ingredient") or "")) or str(item.get("ingredient") or "").strip()
        if name:
            ordered_names.append(name)
    for name in ingredients or []:
        if name not in ordered_names:
            ordered_names.append(name)

    for name in ordered_names:
        looked_up = lookup_ingredient_knowledge(name)
        named = bool(looked_up) and _row_names_this_ingredient(name, looked_up)
        knowledge = looked_up if named else None
        flag = flag_by_name.get(name.lower()) or {}
        title = chip_title(name, knowledge)
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        definition = shopper_definition(name, knowledge)
        plain = str(flag.get("plain_explanation") or "").strip()
        if plain and not is_placeholder_copy(plain) and plain not in definition:
            if "listed on this product" in definition.lower():
                definition = plain
            elif any(char.isdigit() for char in plain):
                definition = f"{definition} {plain}"
        insights.append(
            {
                "ingredient": name,
                "title": title,
                "category": str((knowledge or {}).get("category") or ""),
                "what_it_is": definition,
                "commonly_seen_in": str((knowledge or {}).get("commonly_seen_in") or ""),
                "possible_effects": ""
                if is_placeholder_copy(str((knowledge or {}).get("possible_effects") or ""))
                else str((knowledge or {}).get("possible_effects") or ""),
                "affects_allergens": list((knowledge or {}).get("affects_allergens") or flag.get("affects_allergens") or []),
                "affects_diets": list((knowledge or {}).get("affects_diets") or flag.get("affects_diets") or []),
                "source": str((knowledge or {}).get("source") or ""),
                "aliases": list((knowledge or {}).get("aliases") or []),
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
    ingredients_incomplete: bool = False,
    declared_allergens: list[dict] | None = None,
) -> dict:
    ingredients = _present_ingredients(ingredients)
    flags = [
        enrich_flag_with_knowledge(item)
        for item in check_allergies(user_allergies or [], ingredients)
    ]
    flags = apply_condition_rules(flags, user_conditions, nutrition)
    flags = apply_declared_allergens(flags, declared_allergens, user_allergies)
    flags = [enrich_flag_with_knowledge(item) for item in flags]

    if ingredients_incomplete and not any(item.get("status") == "avoid" for item in flags):
        flags.append(
            {
                "ingredient": "Ingredient list",
                "status": "caution",
                "matched_category": None,
                "matched_kb_entry": None,
                "identified": False,
                "reason": (
                    "The ingredient list is incomplete, so Scanity cannot confirm "
                    "this product against your saved allergies."
                ),
                "plain_explanation": (
                    "Open Food Facts did not provide a complete ingredient list. "
                    "A saved allergy could be missing from what Scanity was able to check."
                ),
            }
        )

    verdict = overall_verdict(flags)
    score_breakdown = explain_personalized_score(
        flags,
        conditions=user_conditions,
        nutrition=nutrition,
    )
    safety_score = score_breakdown["score"]
    # The verdict and the score share one band. If they ever disagree, keep
    # the verdict and say the number was held inside that band.
    verdict_band = {"safe": (70, 100), "caution": (40, 69), "avoid": (0, 39)}.get(verdict)
    if verdict_band and not (verdict_band[0] <= safety_score <= verdict_band[1]):
        safety_score = min(verdict_band[1], max(verdict_band[0], safety_score))
        score_breakdown = {
            **score_breakdown,
            "score": safety_score,
            "band": verdict,
            "clamped": True,
            "summary": (
                f"{safety_score} because the {verdict} result holds the number inside "
                f"{verdict_band[0]}–{verdict_band[1]}. {score_breakdown.get('summary') or ''}"
            ).strip(),
        }
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
        "score_breakdown": score_breakdown,
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
        "score_breakdown": score_breakdown,
        "nutri_score_grade": grade,
        "explanation": explanation,
        "ai_source": ai_status.get("source") or "template",
        "ai_detail": ai_status.get("detail") or "",
        "profile_applied": {
            "allergies": user_allergies or [],
            "conditions": user_conditions or [],
        },
    }
