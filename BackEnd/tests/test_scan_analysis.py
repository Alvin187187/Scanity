from app.services.nutriscore_service import nutri_score_grade
from app.services.scan_analysis_service import analyze_ingredients


def test_milk_allergy_avoids_casein():
    result = analyze_ingredients(
        ["sugar", "sodium caseinate"],
        user_allergies=["dairy"],
    )
    assert result["verdict"] == "avoid"
    assert "sodium caseinate" in result["allergy_flags"]
    assert "avoid" in result["explanation"].lower()
    assert result.get("label_insights") is not None
    assert result.get("ai_source") in {"gemini", "template", "unset"}


def test_sugar_and_e100_use_knowledge_not_flagged():
    result = analyze_ingredients(
        ["sugar", "e100", "water"],
        user_allergies=["milk"],
    )
    assert result["verdict"] == "safe"
    assert result["allergy_flags"] == []
    titles = {item["title"].lower() for item in result["label_insights"]}
    assert "sugar" in titles
    assert "e100" in titles


def test_unmapped_ingredient_is_caution_not_safe():
    result = analyze_ingredients(["mystery flavoring"], user_allergies=["milk"])
    assert result["verdict"] == "caution"
    assert result["allergy_flags"] == []


def test_nutri_score_needs_enough_data():
    assert nutri_score_grade({"sugars_g": 2}) is None
    grade = nutri_score_grade(
        {
            "sugars_g": 2,
            "sat_fat_g": 0.5,
            "sodium_mg": 40,
            "fiber_g": 4,
            "protein_g": 8,
            "energy_kj": 200,
        }
    )
    assert grade in {"a", "b", "c", "d", "e"}
