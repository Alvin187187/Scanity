from seed.ingredient_knowledge_loader import search_ingredient_knowledge, shopper_source


def test_shopper_source_hides_codex_label():
    assert "codex" not in shopper_source("Codex / EFSA additive summaries (general)").lower()
    assert "EFSA" in shopper_source("Codex / EFSA additive summaries (general)")
    assert "USDA" in shopper_source("Codex / general nutrition references")


def test_search_finds_additive_and_related_terms():
    malt = search_ingredient_knowledge("maltodextrin", limit=5)
    assert malt
    assert malt[0]["ingredient_name"].lower() == "maltodextrin"
    assert malt[0]["what_it_is"]

    soy = search_ingredient_knowledge("soy", limit=8)
    names = [row["ingredient_name"].lower() for row in soy]
    assert any("soy" in name for name in names)
    assert len(names) >= 1
