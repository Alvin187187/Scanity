from app.services.ingredient_language import (
    prefer_english_ingredient,
    prefer_english_ingredients_text,
)
from app.services.password_rules import password_issue


def test_all_numeric_password_meets_the_one_number_rule():
    assert password_issue("12345678") is None
    assert password_issue("scanity1") is None


def test_password_still_requires_length_and_one_number():
    assert password_issue("lettersonly") == "Password must contain at least 1 number."
    assert password_issue("short1") == "Password must be at least 8 characters."


def test_foreign_ingredient_uses_english_open_food_facts_id():
    name, translated = prefer_english_ingredient(
        {"id": "en:wheat-flour", "text": "Farine de blé"}
    )
    assert name == "wheat flour"
    assert translated is True


def test_english_ingredient_text_is_left_alone():
    name, translated = prefer_english_ingredient(
        {"id": "en:sugar", "text": "Sugar"}
    )
    assert name == "Sugar"
    assert translated is False


def test_foreign_ingredients_paragraph_prefers_english_text():
    text, translated = prefer_english_ingredients_text(
        {
            "ingredients_text": "Sucre, farine de blé",
            "ingredients_text_en": "Sugar, wheat flour",
        }
    )
    assert text == "Sugar, wheat flour"
    assert translated is True
