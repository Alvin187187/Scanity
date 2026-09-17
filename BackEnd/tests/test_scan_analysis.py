from app.services.nutriscore_service import nutri_score_grade
from app.services.scan_analysis_service import analyze_ingredients


def test_milk_allergy_avoids_casein():
    result = analyze_ingredients(
        ["sugar", "sodium caseinate"],
        user_allergies=["dairy"],
    )
    assert result["verdict"] == "avoid"
    assert "sodium caseinate" in result["allergy_flags"]
    assert result["explanation"].lower().startswith("avoid")


def test_unmapped_ingredient_is_caution_not_safe():
    result = analyze_ingredients(["mystery flavoring"], user_allergies=["milk"])
    assert result["verdict"] == "caution"


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
