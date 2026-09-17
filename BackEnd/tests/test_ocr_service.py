import pytest

from app.services.ocr_service import (
    InvalidOCRInputError,
    clean_ingredient_text,
    normalize_ingredients,
    process_ocr_result,
)


def test_clean_ingredient_text():
    result = clean_ingredient_text("Sugar, Milk, Salt")

    assert result == ["Sugar", "Milk", "Salt"]


def test_normalize_ingredients():
    result = normalize_ingredients([
        " Sugar ",
        "Milk",
        "",
        " Salt ",
    ])

    assert result == ["Sugar", "Milk", "Salt"]


def test_process_ocr_result_uses_extracted_text():
    result = process_ocr_result(
        extracted_text="Sugar, Milk, Salt"
    )

    assert result["parsed_ingredients"] == [
        "Sugar",
        "Milk",
        "Salt",
    ]

    assert result["allergy_flags"] == []
    assert result["score"] is None


def test_edited_ingredients_replace_ocr_result():
    result = process_ocr_result(
        extracted_text="Sugar, Mik, Salt",
        edited_ingredients=[
            "Sugar",
            "Milk",
            "Salt",
        ],
    )

    assert result["parsed_ingredients"] == [
        "Sugar",
        "Milk",
        "Salt",
    ]


def test_confirmed_ingredients_are_supported():
    result = process_ocr_result(
        confirmed_ingredients=[
            "Sugar",
            "Milk",
            "Salt",
        ]
    )

    assert result["parsed_ingredients"] == [
        "Sugar",
        "Milk",
        "Salt",
    ]


def test_blank_input_raises_error():
    with pytest.raises(
        InvalidOCRInputError,
        match="No usable ingredients were found",
    ):
        process_ocr_result(extracted_text="")


def test_clean_ingredient_text_without_header():
    result = clean_ingredient_text("Sugar Milk Salt\nCalories 120")
    assert result == ["Sugar Milk Salt"]


def test_clean_ingredient_text_splits_and():
    result = clean_ingredient_text("Ingredients: sugar and salt and milk")
    assert [item.lower() for item in result] == ["sugar", "salt", "milk"]


def test_process_ocr_result_can_allow_empty_for_preview():
    result = process_ocr_result(
        extracted_text="blurry label noise",
        require_ingredients=False,
    )
    assert result["extracted_text"] == "blurry label noise"
    assert isinstance(result["parsed_ingredients"], list)
