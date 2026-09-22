"""English layer for foreign packaged-food ingredient lists.

Open Food Facts often returns the label language (for example French or
German). When an English name is available, Scanity shows that instead.
"""

from __future__ import annotations


def looks_foreign(text: str) -> bool:
    value = (text or "").strip()
    if not value:
        return False
    return any(ord(character) > 127 and character.isalpha() for character in value)


def english_name_from_off_id(ingredient_id: str) -> str | None:
    raw = (ingredient_id or "").strip().lower()
    if not raw.startswith("en:"):
        return None
    name = raw[3:].replace("-", " ").replace("_", " ").strip()
    return name or None


def prefer_english_ingredient(ingredient: dict) -> tuple[str, bool]:
    """Return (display name, translated)."""
    original = str(ingredient.get("text") or "").strip()
    english = english_name_from_off_id(str(ingredient.get("id") or ""))
    if english and (not original or looks_foreign(original)):
        return english, bool(original)
    if english and original and original.lower() != english.lower() and looks_foreign(original):
        return english, True
    return original or english or "", False


def prefer_english_ingredients_text(raw: dict) -> tuple[str, bool]:
    original = str(raw.get("ingredients_text") or "").strip()
    english = str(raw.get("ingredients_text_en") or "").strip()
    if english and (not original or looks_foreign(original)):
        return english, bool(original) and original != english
    return original or english, False
