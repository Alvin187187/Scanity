import asyncio
from uuid import UUID

from sqlalchemy.exc import OperationalError

from app.services import barcode_lookup_service as lookup


class _BrokenDb:
    def query(self, *_args, **_kwargs):
        raise OperationalError("SELECT 1", {}, Exception("db down"))

    def rollback(self):
        return None


def test_barcode_lookup_survives_database_failure(monkeypatch):
    async def fake_fetch(barcode):
        return {
            "product_name": "Test Cookie With A Very Long Brand Name From Open Food Facts",
            "brands": "Super Long Brand Name That Exceeds Twenty Five Characters",
            "categories": "Snacks, Sweet snacks, Biscuits and cakes, Biscuits",
            "image_url": "https://example.com/cookie.jpg",
            "ingredients_text": "sugar, wheat flour, milk powder",
            "ingredients": [
                {"text": "sugar"},
                {"text": "wheat flour"},
                {"text": "milk powder"},
            ],
            "nutriments": {
                "sugars_100g": 30,
                "saturated-fat_100g": 8,
                "proteins_100g": 5,
                "fiber_100g": 2,
                "energy-kj_100g": 1800,
                "sodium_100g": 0.2,
            },
        }

    monkeypatch.setattr(lookup, "fetch_product_by_barcode", fake_fetch)

    product = asyncio.run(lookup.get_product_by_barcode(_BrokenDb(), "3017620422003"))

    assert product["barcode"] == "3017620422003"
    assert product["product_name"]
    assert len(product["brand"]) <= 25
    assert len(product["category"]) <= 25
    assert UUID(str(product["product_id"]))
    assert product["nutrition"]["sugars_g"] == 30
    assert any(item["name"] == "sugar" for item in product["ingredients"])
