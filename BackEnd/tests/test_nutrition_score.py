"""
Unit tests for app/services/nutrition_score_service.py
"""
from app.services.nutrition_score_service import calculate_nutri_score, Nutriments

def test_nutri_score_healthy_item():
    nutrients = Nutriments(
        energy_kj=167.0,
        sugars_g=1.0,
        sat_fat_g=0.2,
        sodium_mg=10.0,
        fruits_veg_nuts_pct=80.0,
        fiber_g=3.0,
        proteins_g=2.0
    )
    score_data = calculate_nutri_score(nutrients)
    assert score_data["nutri_score_grade"] in ["A", "B"]

def test_nutri_score_unhealthy_item():
    nutrients = Nutriments(
        energy_kj=2300.0,
        sugars_g=45.0,
        sat_fat_g=12.0,
        sodium_mg=800.0,
        fruits_veg_nuts_pct=0.0,
        fiber_g=0.0,
        proteins_g=1.0
    )
    score_data = calculate_nutri_score(nutrients)
    assert score_data["nutri_score_grade"] in ["D", "E"]

