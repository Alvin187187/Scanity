from ai.allergy_engine import check_allergies, compute_safety_score, overall_verdict
from ai.condition_engine import apply_condition_rules, compute_personalized_score
from app.services.scan_analysis_service import analyze_ingredients


def test_diabetes_flags_sugar_and_lowers_score():
    flags = check_allergies([], ["water", "sugar", "coffee"])
    flags = apply_condition_rules(flags, ["diabetes"], {"sugars_g": 18})
    assert overall_verdict(flags) == "caution"
    sugar = next(item for item in flags if "sugar" in item["ingredient"].lower())
    assert sugar["status"] == "caution"
    score = compute_personalized_score(flags, conditions=["diabetes"], nutrition={"sugars_g": 18})
    # 18 g/100g is UK front-of-pack amber, so the condition anchor is 50.
    assert score == 50


def test_flags_apply_to_the_ingredient_not_a_lookalike():
    celiac = apply_condition_rules(
        check_allergies([], ["buckwheat", "maltodextrin", "wheat flour"]),
        ["celiac"],
        None,
    )
    by_name = {item["ingredient"]: item for item in celiac}
    assert by_name["buckwheat"].get("condition") != "celiac"
    assert by_name["maltodextrin"].get("condition") != "celiac"
    assert by_name["wheat flour"]["status"] == "avoid"
    assert by_name["wheat flour"].get("condition") == "celiac"

    pressure = apply_condition_rules(
        check_allergies([], ["sodium caseinate", "sea salt"]),
        ["hypertension"],
        None,
    )
    by_pressure = {item["ingredient"]: item for item in pressure}
    assert by_pressure["sodium caseinate"].get("condition") != "hypertension"
    assert by_pressure["sea salt"]["status"] == "caution"
    assert by_pressure["sea salt"].get("condition") == "hypertension"

    lactose = apply_condition_rules(
        check_allergies([], ["coconut milk", "milk powder"]),
        ["lactose"],
        None,
    )
    by_lactose = {item["ingredient"]: item for item in lactose}
    assert by_lactose["coconut milk"].get("condition") != "lactose"
    assert by_lactose["milk powder"]["status"] == "avoid"
    assert by_lactose["milk powder"].get("condition") == "lactose"


def test_lactose_avoids_milk():
    flags = check_allergies([], ["water", "milk powder"])
    flags = apply_condition_rules(flags, ["lactose"], None)
    assert overall_verdict(flags) == "avoid"
    score = compute_safety_score(flags, conditions=["lactose"])
    assert score == 32


def test_black_coffee_without_sugar_stays_safer_for_diabetes():
    result = analyze_ingredients(
        ["coffee", "water"],
        user_allergies=[],
        user_conditions=["diabetes", "lactose"],
        nutrition={"sugars_g": 0.2},
    )
    assert result["verdict"] == "safe"
    assert result["safety_score"] == 100


def test_diabetes_flags_sweetener_aliases_and_e_numbers():
    result = analyze_ingredients(
        [
            "E211 - Sodium benzoate",
            "E330 - Citric acid",
            "E331 - Sodium citrates",
            "E385 - Calcium disodium ethylenediaminetetraacetate",
            "acesulfame potassium",
            "E955",
        ],
        user_allergies=[],
        user_conditions=["diabetes"],
    )
    by_name = {item["ingredient"]: item for item in result["allergy_matches"]}
    assert by_name["acesulfame potassium"]["status"] == "caution"
    assert "diabetes" in (by_name["acesulfame potassium"].get("affects_diets") or [])
    assert by_name["E955"]["status"] == "caution"
    assert by_name["E211 - Sodium benzoate"]["status"] == "safe"
    assert by_name["E330 - Citric acid"]["status"] == "safe"
    assert by_name["E331 - Sodium citrates"]["status"] == "safe"
    assert by_name["E385 - Calcium disodium ethylenediaminetetraacetate"]["status"] == "safe"
    titles = {item["title"].lower() for item in result["label_insights"]}
    assert "acesulfame k" in titles
    assert "sucralose" in titles
    assert "sodium citrates" in titles
    assert "calcium disodium edta" in titles


def test_sweet_coffee_drink_caution_for_diabetes():
    result = analyze_ingredients(
        ["coffee", "sugar", "milk"],
        user_allergies=[],
        user_conditions=["diabetes", "lactose"],
        nutrition={"sugars_g": 20},
    )
    assert result["verdict"] == "avoid"  # lactose + milk
    # One avoid (32) and amber sugars (20 g/100g, −2).
    assert result["safety_score"] == 30
    assert result["score_breakdown"]["band"] == "avoid"
    assert result["score_breakdown"]["clamped"] is False
