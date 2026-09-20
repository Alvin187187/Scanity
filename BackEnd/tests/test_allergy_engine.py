import pytest

from ai.allergy_engine import check_allergies, compute_safety_score, overall_verdict


def test_dairy_synonym_avoids_casein():
    flags = check_allergies(["dairy"], ["sodium caseinate"])
    assert overall_verdict(flags) == "avoid"


def test_unmapped_is_caution():
    flags = check_allergies(["milk"], ["rice"])
    assert overall_verdict(flags) == "caution"


def test_empty_list_is_not_safe():
    assert overall_verdict(check_allergies(["milk"], [])) == "caution"


def test_plain_water_is_safe_not_caution():
    flags = check_allergies(["milk"], ["water", "carbonated water"])
    assert all(item["status"] == "safe" for item in flags)
    assert overall_verdict(flags) == "safe"
    assert compute_safety_score(flags) == 100


def test_flavored_waters_are_not_inert_shortcut():
    from ai.allergy_engine import _is_inert_ingredient

    assert _is_inert_ingredient("purified water")
    assert not _is_inert_ingredient("coconut water")
    assert not _is_inert_ingredient("almond water")


def test_safety_score_bands():
    avoid_flags = check_allergies(["dairy"], ["sodium caseinate"])
    assert 0 <= compute_safety_score(avoid_flags) <= 39

    caution_flags = check_allergies(["milk"], ["mystery extract"])
    score = compute_safety_score(caution_flags)
    assert 40 <= score <= 69

    assert compute_safety_score([]) == 50
