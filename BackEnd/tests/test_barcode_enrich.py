from app.services.barcode_lookup_service import (
    _enrich_cached_product,
    _ephemeral_product,
    _merge_live_fields,
)


def test_merge_live_fields_prefers_off_nutrition_and_image():
    base = {
        "product_id": "p1",
        "barcode": "4800016640038",
        "product_name": "Cached",
        "ingredients_raw_text": "sugar",
        "ingredients": [{"name": "sugar", "is_allergen": False}],
        "image_url": None,
        "nutrition": None,
    }
    mapped = {
        "nutrition": {"sugars_g": 10, "protein_g": 2, "fiber_g": 1},
        "image_url": "https://example.com/p.jpg",
        "ingredients_raw_text": "sugar, salt",
        "ingredients": [{"name": "sugar", "is_allergen": False}],
    }

    merged = _merge_live_fields(base, mapped)

    assert merged["nutrition"]["sugars_g"] == 10
    assert merged["image_url"] == "https://example.com/p.jpg"
    assert merged["ingredients_raw_text"] == "sugar"
    assert merged["product_name"] == "Cached"


def test_enrich_cached_product_maps_openfoodfacts_payload():
    cached = {
        "product_id": "p1",
        "barcode": "3017620422003",
        "product_name": "Nutella",
        "ingredients_raw_text": "",
        "ingredients": [],
        "image_url": None,
        "nutrition": None,
    }
    raw = {
        "product_name": "Nutella",
        "brands": "Ferrero",
        "image_url": "https://example.com/nutella.jpg",
        "ingredients_text": "sugar, palm oil, hazelnuts",
        "ingredients": [{"text": "sugar"}, {"text": "hazelnuts"}],
        "nutriments": {
            "sugars_100g": 56.3,
            "saturated-fat_100g": 10.6,
            "proteins_100g": 6.3,
            "fiber_100g": 0,
            "energy-kj_100g": 2252,
            "sodium_100g": 0.107,
        },
    }

    enriched = _enrich_cached_product(cached, raw, "3017620422003")

    assert enriched["nutrition"]["sugars_g"] == 56.3
    assert enriched["image_url"] == "https://example.com/nutella.jpg"
    assert "sugar" in (enriched.get("ingredients_raw_text") or "")


def test_ephemeral_product_keeps_official_nutri_score():
    product = _ephemeral_product(
        {
            "barcode": "12345678",
            "product_name": "Sample",
            "nutriscore_grade": "c",
            "ingredients": [{"name": "milk", "is_allergen": True}],
            "ingredients_incomplete": False,
        }
    )
    assert product["nutriscore_grade"] == "c"
    assert product["ingredients"][0]["name"] == "milk"
