from app.services.explanation_service import plain_shopper_text
from app.services.product_title_service import heuristic_product_title


def test_package_title_skips_ingredient_lines():
    text = "\n".join(
        [
            "Bravo Biscuits",
            "Biscuits with Sesame Seeds",
            "Ingredients: Wheat Flour, Sesame Seeds, Sugar",
            "Nutrition Facts",
        ]
    )
    assert heuristic_product_title(text) == "Bravo Biscuits"


def test_title_keeps_the_brand_instead_of_a_generic_word():
    text = "\n".join(["Nature Spring", "Purified Drinking Water", "Water", "500 ml"])
    assert heuristic_product_title(text) == "Nature Spring"


def test_package_title_skips_marketing_description():
    text = "\n".join(
        [
            "Crispy biscuits baked with sesame seeds and a touch of sugar",
            "Bravo Biscuits",
            "Ingredients: Wheat Flour, Sesame Seeds",
        ]
    )
    assert heuristic_product_title(text) == "Bravo Biscuits"


def test_plain_shopper_text_removes_markdown_stars():
    raw = "**Avoid** — **Wheat Flour**, **Sesame Seeds** lined up with an allergy you saved."
    cleaned = plain_shopper_text(raw)
    assert "**" not in cleaned
    assert "Wheat Flour" in cleaned
    assert cleaned.startswith("Avoid")
