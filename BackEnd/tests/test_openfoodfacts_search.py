from app.services.openfoodfacts_service import _hit_score, _rank_hits


def test_brand_on_the_package_beats_a_partial_name_hit():
    juice = _hit_score(
        "Lucky Day",
        {
            "product_name": "Orange Juice Drink",
            "brands": "Lucky Day",
            "image_url": "https://example.com/juice.jpg",
        },
    )
    coffee = _hit_score(
        "Lucky Day",
        {
            "product_name": "Kopiko lucky day",
            "brands": "kopiko",
            "image_url": "https://example.com/coffee.jpg",
        },
    )
    stray = _hit_score(
        "Lucky Day",
        {"product_name": "Milk powder", "brands": "Lucky"},
    )
    assert juice > coffee
    assert stray == 0


def test_rank_hits_keeps_brand_matches():
    ranked = _rank_hits(
        "Lucky Day",
        {
            "hits": [
                {
                    "code": "111",
                    "product_name": "Milk powder",
                    "brands": ["Lucky"],
                },
                {
                    "code": "222",
                    "product_name": "Orange Juice Drink",
                    "brands": ["Lucky Day"],
                    "image_url": "https://example.com/juice.jpg",
                },
            ]
        },
    )
    assert ranked[0]["code"] == "222"
    assert ranked[0]["image_url"]
