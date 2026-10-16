import json

from ai.allergy_engine import check_allergies, compute_safety_score, overall_verdict
from ai.condition_engine import apply_condition_rules, explain_personalized_score
from ai.safety_score import (
    AVOID_ANCHOR,
    CONDITION_ANCHOR,
    INCOMPLETE_ANCHOR,
    SAFE_SCORE,
    UNKNOWN_ANCHOR,
    UNKNOWN_FLOOR,
    build_safety_score,
)
from app.services.scan_analysis_service import analyze_ingredients


def _band(score: int) -> str:
    if score >= 70:
        return "safe"
    if score >= 40:
        return "caution"
    return "avoid"


def test_same_inputs_rebuild_the_same_score():
    flags = check_allergies(["dairy", "peanut"], ["sodium caseinate", "sugar", "peanuts"])
    flags = apply_condition_rules(flags, ["diabetes"], {"sugars_g": 26})
    first = explain_personalized_score(flags, conditions=["diabetes"], nutrition={"sugars_g": 26})
    second = explain_personalized_score(flags, conditions=["diabetes"], nutrition={"sugars_g": 26})
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert first["clamped"] is False
    assert first["system"] == "scanity-evidence-v1"
    assert str(first["score"]) in first["summary"]


def test_score_band_matches_verdict():
    cases = [
        analyze_ingredients(["water"], user_allergies=["milk"]),
        analyze_ingredients(["zxq-mystery-extract-99"], user_allergies=["milk"]),
        analyze_ingredients(["sodium caseinate"], user_allergies=["dairy"]),
        analyze_ingredients(["sugar", "water"], user_conditions=["diabetes"], nutrition={"sugars_g": 18}),
        analyze_ingredients([], user_allergies=["milk"]),
    ]
    for result in cases:
        score = result["safety_score"]
        assert result["verdict"] == _band(score)
        assert result["score_breakdown"]["band"] == result["verdict"]
        assert result["score_breakdown"]["score"] == score


def test_anchors_are_the_published_starts():
    assert SAFE_SCORE == 100
    assert AVOID_ANCHOR == 32
    assert UNKNOWN_ANCHOR == 64
    assert INCOMPLETE_ANCHOR == 58
    assert CONDITION_ANCHOR == {"none": 58, "green": 58, "amber": 50, "red": 42}


def test_more_confirmed_hits_score_lower():
    one = compute_safety_score(check_allergies(["dairy"], ["milk"]))
    two = compute_safety_score(check_allergies(["dairy", "peanut"], ["milk", "peanuts"]))
    assert one == 32
    assert two == 24
    assert two < one


def test_unknowns_cannot_fall_into_avoid():
    flags = check_allergies(["milk"], [f"zxq-mystery-{index}" for index in range(12)])
    breakdown = build_safety_score(flags)
    assert breakdown["score"] == UNKNOWN_FLOOR
    assert breakdown["band"] == "caution"
    assert overall_verdict(flags) == "caution"


def test_sugar_word_is_not_charged_twice_when_the_panel_is_present():
    with_word = apply_condition_rules(
        check_allergies([], ["sugar", "water"]),
        ["diabetes"],
        {"sugars_g": 18},
    )
    panel_only = apply_condition_rules(
        check_allergies([], ["water"]),
        ["diabetes"],
        {"sugars_g": 18},
    )
    assert compute_safety_score(with_word, conditions=["diabetes"], nutrition={"sugars_g": 18}) == 50
    assert compute_safety_score(panel_only, conditions=["diabetes"], nutrition={"sugars_g": 18}) == 50


def test_fsa_bands_move_the_condition_score():
    def scored(sugars: float) -> int:
        flags = apply_condition_rules(
            check_allergies([], ["water"]),
            ["diabetes"],
            {"sugars_g": sugars},
        )
        return compute_safety_score(flags, conditions=["diabetes"], nutrition={"sugars_g": sugars})

    assert scored(4) == 100  # green, and water is not a sugar hit
    assert scored(6) == 50  # amber: over 5 g and at most 22.5 g
    assert scored(22.5) == 50
    assert scored(22.6) == 42  # red: over 22.5 g
    assert scored(22.6) < scored(6) < scored(4)


def test_low_sugars_with_a_sugar_ingredient_stay_mild_caution():
    flags = apply_condition_rules(
        check_allergies([], ["sugar", "water"]),
        ["diabetes"],
        {"sugars_g": 2},
    )
    breakdown = explain_personalized_score(flags, conditions=["diabetes"], nutrition={"sugars_g": 2})
    assert breakdown["score"] == 58
    assert breakdown["band"] == "caution"
    assert "low line" in breakdown["lines"][0]["detail"]


def test_may_contain_is_caution_not_an_unknown():
    from ai.allergy_engine import apply_declared_allergens

    flags = apply_declared_allergens(
        check_allergies(["milk"], ["water"]),
        [{"name": "Milk", "category": "milk", "trace": True}],
        ["milk"],
    )
    breakdown = build_safety_score(flags)
    assert breakdown["band"] == "caution"
    assert breakdown["score"] == 50
    assert "may contain" in breakdown["summary"].lower()
    assert "could not be identified" not in breakdown["summary"].lower()


def test_declared_contains_is_avoid():
    from ai.allergy_engine import apply_declared_allergens

    flags = apply_declared_allergens(
        check_allergies(["milk"], ["water"]),
        [{"name": "Milk", "category": "milk", "trace": False}],
        ["milk"],
    )
    breakdown = build_safety_score(flags)
    assert breakdown["band"] == "avoid"
    assert breakdown["score"] == 32
    assert "milk" in breakdown["summary"].lower()


def test_breakdown_names_the_avoid_ingredient():
    flags = check_allergies(["dairy"], ["sodium caseinate"])
    breakdown = build_safety_score(flags)
    assert breakdown["score"] == 32
    assert "sodium caseinate" in breakdown["summary"].lower()
    assert breakdown["lines"][0]["points"] == 32
