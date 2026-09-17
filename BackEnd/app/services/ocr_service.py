"""
OCR processing service for Scanity.

Issue #150 / #173

Cleans extracted ingredient text. RapidOCR reads the image; this step only
parses the resulting text. Allergy flags and scoring are added by
scan_analysis_service after parsing.
"""

from __future__ import annotations

import re


class InvalidOCRInputError(Exception):
    """Raised when no usable ingredient input is provided."""


def clean_ingredient_text(text: str) -> list[str]:
    """Convert OCR ingredient text into a clean ingredient list."""
    if not text or not text.strip():
        return []

    working = text.strip()
    match = re.search(r"ingredients?\s*:?\s*", working, flags=re.IGNORECASE)
    if match:
        working = working[match.end():]

    for stop in (
        "nutrition facts",
        "nutrition information",
        "allergen information",
        "contains:",
        "serving size",
        "calories",
    ):
        index = working.lower().find(stop)
        if index > 0:
            working = working[:index]

    parts: list[str] = []
    for chunk in re.split(r"[,;\n]", working):
        cleaned = re.sub(r"\s+", " ", chunk)
        cleaned = cleaned.strip(" .•*-")
        cleaned = re.sub(r"^\d+\s*%\s*", "", cleaned).strip()
        if 1 < len(cleaned) < 80:
            parts.append(cleaned)
    return parts[:40]


def normalize_ingredients(ingredients: list[str]) -> list[str]:
    """Clean ingredients supplied by the user or frontend."""
    cleaned_ingredients = []
    for ingredient in ingredients:
        if not isinstance(ingredient, str):
            continue
        cleaned_item = re.sub(r"\s+", " ", ingredient).strip(" .•*-")
        if cleaned_item:
            cleaned_ingredients.append(cleaned_item)
    return cleaned_ingredients


def process_ocr_result(
    extracted_text: str = "",
    confirmed_ingredients: list[str] | None = None,
    edited_ingredients: list[str] | None = None,
) -> dict:
    """
    Prepare an OCR result.

    Priority:
    1. User-edited ingredients
    2. Confirmed ingredients
    3. Ingredients parsed from OCR text
    """
    if edited_ingredients is not None:
        parsed_ingredients = normalize_ingredients(edited_ingredients)
    elif confirmed_ingredients is not None:
        parsed_ingredients = normalize_ingredients(confirmed_ingredients)
    else:
        parsed_ingredients = clean_ingredient_text(extracted_text)

    if not parsed_ingredients:
        raise InvalidOCRInputError("No usable ingredients were found.")

    return {
        "extracted_text": (extracted_text or "").strip(),
        "parsed_ingredients": parsed_ingredients,
        "allergy_flags": [],
        "score": None,
    }
