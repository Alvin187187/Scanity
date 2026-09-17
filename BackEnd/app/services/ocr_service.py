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


_INGREDIENT_HEADERS = (
    r"ingredients?",
    r"ingredientes?",
    r"mga\s+sangkap",
    r"sangkap",
    r"composition",
    r"contains?",
)

_STOP_MARKERS = (
    "nutrition facts",
    "nutrition information",
    "nutritional information",
    "allergen information",
    "allergens",
    "contains:",
    "may contain",
    "serving size",
    "servings per",
    "calories",
    "energy",
    "best before",
    "manufactured",
    "distributed by",
    "net wt",
    "net weight",
)


def clean_ingredient_text(text: str) -> list[str]:
    """Convert OCR ingredient text into a clean ingredient list."""
    if not text or not text.strip():
        return []

    working = text.strip()
    header = re.search(
        rf"(?:{'|'.join(_INGREDIENT_HEADERS)})\s*:?\s*",
        working,
        flags=re.IGNORECASE,
    )
    if header:
        working = working[header.end() :]

    lower = working.lower()
    cut = len(working)
    for stop in _STOP_MARKERS:
        index = lower.find(stop)
        # index == 0 means the OCR captured the nutrition panel first —
        # there is no ingredient list ahead of it.
        if 0 <= index < cut:
            cut = index
    working = working[:cut]

    # OCR often joins lines without commas; normalize common separators.
    working = working.replace("|", ",")
    working = re.sub(r"\s+and\s+", ", ", working, flags=re.IGNORECASE)
    working = re.sub(r"[•·▪◦]\s*", ", ", working)

    parts: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[,;\n/]+", working):
        cleaned = _clean_one_ingredient(chunk)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(cleaned)
    return parts[:50]


def _clean_one_ingredient(chunk: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", chunk or "")
    cleaned = cleaned.strip(" .•*-–—:|()[]{}")
    cleaned = re.sub(r"^\d+\s*%\s*", "", cleaned).strip()
    cleaned = re.sub(r"^\d+[.)]\s*", "", cleaned).strip()
    # Drop pure numbers / nutrition table leftovers.
    if re.fullmatch(r"[\d.,%\s]+", cleaned or ""):
        return None
    if len(cleaned) < 2 or len(cleaned) > 80:
        return None
    # Too few letters → likely OCR junk from the nutrition panel.
    letters = sum(1 for ch in cleaned if ch.isalpha())
    if letters < 2:
        return None
    return cleaned


def normalize_ingredients(ingredients: list[str]) -> list[str]:
    """Clean ingredients supplied by the user or frontend."""
    cleaned_ingredients = []
    seen: set[str] = set()
    for ingredient in ingredients:
        if not isinstance(ingredient, str):
            continue
        cleaned_item = _clean_one_ingredient(ingredient)
        if not cleaned_item:
            continue
        key = cleaned_item.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned_ingredients.append(cleaned_item)
    return cleaned_ingredients


def process_ocr_result(
    extracted_text: str = "",
    confirmed_ingredients: list[str] | None = None,
    edited_ingredients: list[str] | None = None,
    *,
    require_ingredients: bool = True,
) -> dict:
    """
    Prepare an OCR result.

    Priority:
    1. User-edited ingredients
    2. Confirmed ingredients
    3. Ingredients parsed from OCR text

    When require_ingredients is False (image preview path), empty parses are
    allowed so the shopper can still review/edit the raw text.
    """
    if edited_ingredients is not None:
        parsed_ingredients = normalize_ingredients(edited_ingredients)
    elif confirmed_ingredients is not None:
        parsed_ingredients = normalize_ingredients(confirmed_ingredients)
    else:
        parsed_ingredients = clean_ingredient_text(extracted_text)

    if require_ingredients and not parsed_ingredients:
        raise InvalidOCRInputError("No usable ingredients were found.")

    return {
        "extracted_text": (extracted_text or "").strip(),
        "parsed_ingredients": parsed_ingredients,
        "allergy_flags": [],
        "score": None,
    }
