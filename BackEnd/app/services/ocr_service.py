"""
OCR processing service for Scanity.

Issue #150

This service handles:
- cleaning OCR ingredient text
- confirmed ingredient lists
- user-edited ingredient lists

RapidOCR, authentication, allergy checking, and scoring
will be connected when their related backend work is ready.
"""


class InvalidOCRInputError(Exception):
    """Raised when no usable ingredient input is provided."""

    pass


def clean_ingredient_text(text: str) -> list[str]:
    """
    Convert OCR ingredient text into a clean ingredient list.

    Example:
    "Sugar, Milk, Salt"

    becomes:

    ["Sugar", "Milk", "Salt"]
    """

    if not text or not text.strip():
        return []

    ingredients = []

    for item in text.split(","):
        cleaned_item = item.strip()

        if cleaned_item:
            ingredients.append(cleaned_item)

    return ingredients


def normalize_ingredients(ingredients: list[str]) -> list[str]:
    """
    Clean ingredients supplied by the user or frontend.
    """

    cleaned_ingredients = []

    for ingredient in ingredients:

        if not isinstance(ingredient, str):
            continue

        cleaned_item = ingredient.strip()

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

        parsed_ingredients = normalize_ingredients(
            edited_ingredients
        )

    elif confirmed_ingredients is not None:

        parsed_ingredients = normalize_ingredients(
            confirmed_ingredients
        )

    else:

        parsed_ingredients = clean_ingredient_text(
            extracted_text
        )

    if not parsed_ingredients:
        raise InvalidOCRInputError(
            "No usable ingredients were found."
        )

    return {
        "extracted_text": extracted_text.strip(),
        "parsed_ingredients": parsed_ingredients,

        # Temporary placeholders required by Issue #150.
        "allergy_flags": [],
        "score": None,
    }