import pytest

from ai.allergy_engine import check_allergies, overall_verdict


def test_dairy_synonym_avoids_casein():
    flags = check_allergies(["dairy"], ["sodium caseinate"])
    assert overall_verdict(flags) == "avoid"


def test_unmapped_is_caution():
    flags = check_allergies(["milk"], ["rice"])
    assert overall_verdict(flags) == "caution"


def test_empty_list_is_not_safe():
    assert overall_verdict(check_allergies(["milk"], [])) == "caution"
