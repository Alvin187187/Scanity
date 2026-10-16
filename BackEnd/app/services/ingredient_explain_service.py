"""Ingredient chip copy from the label and the ingredient guide.

A hosted model is not used here. It was renaming ingredients and inventing allergens.
"""

from __future__ import annotations

from seed.ingredient_knowledge_loader import (
    _row_names_this_ingredient,
    chip_title,
    is_placeholder_copy,
    lookup_ingredient_knowledge,
    shopper_definition,
    shopper_source,
)


def _from_knowledge(ingredient: str) -> dict | None:
    knowledge = lookup_ingredient_knowledge(ingredient)
    if not knowledge or not _row_names_this_ingredient(ingredient, knowledge):
        return None
    definition = shopper_definition(ingredient, knowledge)
    effects = str(knowledge.get("possible_effects") or "").strip()
    if is_placeholder_copy(effects):
        effects = ""
    return {
        "ingredient": ingredient,
        "title": chip_title(ingredient, knowledge),
        "category": knowledge.get("category") or "",
        "what_it_is": definition,
        "commonly_seen_in": knowledge.get("commonly_seen_in") or "",
        "possible_effects": effects,
        "affects_allergens": knowledge.get("affects_allergens") or [],
        "affects_diets": knowledge.get("affects_diets") or [],
        "source": shopper_source(knowledge.get("source") or "Scanity ingredient knowledge"),
        "aliases": knowledge.get("aliases") or [],
        "ai_source": "knowledge",
    }


def _instant_local(ingredient: str) -> dict:
    """Accurate shopper note from the label text. A model must not rename the ingredient."""
    knowledge = lookup_ingredient_knowledge(ingredient)
    if knowledge and not _row_names_this_ingredient(ingredient, knowledge):
        knowledge = None
    definition = shopper_definition(ingredient, knowledge)
    return {
        "ingredient": ingredient,
        "title": chip_title(ingredient, knowledge),
        "category": "Ingredient",
        "what_it_is": definition,
        "commonly_seen_in": "",
        "possible_effects": "",
        "affects_allergens": [],
        "affects_diets": [],
        "source": "Scanity label note",
        "aliases": [],
        "ai_source": "label",
    }


def explain_ingredient(
    ingredient: str,
    *,
    product_name: str | None = None,
    profile_conditions: list[str] | None = None,
    allow_hosted_ai: bool = False,
) -> dict:
    """Definition from the ingredient guide. Hosted models do not write chip copy."""
    del product_name, profile_conditions, allow_hosted_ai
    name = (ingredient or "").strip()
    if not name:
        return {
            "ingredient": "",
            "title": "Unknown",
            "category": "",
            "what_it_is": "No ingredient name was provided.",
            "commonly_seen_in": "",
            "possible_effects": "",
            "affects_allergens": [],
            "affects_diets": [],
            "source": "",
            "aliases": [],
            "ai_source": "none",
        }

    cached = _from_knowledge(name)
    if cached and not is_placeholder_copy(cached.get("what_it_is") or ""):
        return cached

    # Chip copy stays on the label and the ingredient guide. A hosted model
    # was renaming ingredients and inventing allergens.
    instant = _instant_local(name)
    if cached:
        instant["category"] = cached.get("category") or instant["category"]
        instant["affects_allergens"] = cached.get("affects_allergens") or []
        instant["affects_diets"] = cached.get("affects_diets") or []
        instant["source"] = cached.get("source") or instant["source"]
    return instant
