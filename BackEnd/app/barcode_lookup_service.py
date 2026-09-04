# app/services/barcode_lookup_service.py
"""
Orchestrates barcode product lookup: local cache check -> OpenFoodFacts fallback ->
mapping -> validation -> storage. This is what ScanOrchestrator calls for FR-01
barcode scans.
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.services.openfoodfacts_service import (
    fetch_product_by_barcode,
    OpenFoodFactsError
)


class ProductNotFoundError(Exception):
    """Raised when the barcode isn't found locally OR on OpenFoodFacts."""
    pass


def validate_barcode(barcode: str) -> bool:
    """Basic format check before any lookup: barcodes are numeric, typically 8-13 digits."""
    return barcode.isdigit() and 8 <= len(barcode) <= 13


async def get_product_by_barcode(db: Session, barcode: str) -> dict:
    """
    Main entry point. Returns a dict matching the Product schema.
    Raises ProductNotFoundError (caller returns 404 + suggest_ocr:true) or
    OpenFoodFactsError (caller returns 503-style error, distinct from not-found).
    """
    if not validate_barcode(barcode):
        raise ValueError("Invalid barcode format")

    # 1. Cache check - local DB is the cache, per the Definition of Done
    cached = _get_local_product(db, barcode)
    if cached:
        return cached

    # 2. Not cached -> call OpenFoodFacts
    try:
        raw_product = await fetch_product_by_barcode(barcode)
    except OpenFoodFactsError:
        # Distinguish external-service-failure from genuine not-found
        # caller must not conflate these into the same response
        raise

    if raw_product is None:
        raise ProductNotFoundError(barcode)

    # 3. Map, validate, store
    mapped = _map_openfoodfacts_to_product_schema(raw_product, barcode)
    _validate_product(mapped)
    stored = _store_product(db, mapped)
    return stored


def _get_local_product(db: Session, barcode: str) -> Optional[dict]:
    """Cache lookup: direct query against the product table by barcode."""
    # Assuming standard raw SQL execution or ORM lookup matching schema
    result = db.execute(
        "SELECT barcode, product_name, brand, category, image_url, ingredients_text FROM product WHERE barcode = :barcode",
        {"barcode": barcode}
    ).fetchone()

    if not result:
        return None

    return {
        "barcode": result[0],
        "product_name": result[1],
        "brand": result[2],
        "category": result[3],
        "image_url": result[4],
        "ingredients_raw_text": result[5] or "",
    }


def _map_openfoodfacts_to_product_schema(raw: dict, barcode: str) -> dict:
    """
    Normalizes OpenFoodFacts' raw response into Scanity's Product schema.
    OpenFoodFacts field names -> our schema field names, with missing-field handling.
    """
    nutriments = raw.get("nutriments", {})
    
    sodium_val = nutriments.get("sodium_100g")
    computed_sodium = (sodium_val * 1000) if sodium_val is not None else None

    return {
        "barcode": barcode,
        "product_name": raw.get("product_name") or raw.get("product_name_en") or "Unknown product",
        "brand": raw.get("brands", "").split(",")[0].strip() if raw.get("brands") else None,
        "category": raw.get("categories", "").split(",")[0].strip() if raw.get("categories") else None,
        "image_url": raw.get("image_url"),
        "ingredients_raw_text": raw.get("ingredients_text", ""),
        "ingredients": _map_ingredients(raw.get("ingredients", [])),
        "nutrition": {
            "energy_kj": nutriments.get("energy-kj_100g"),
            "sugars_g": nutriments.get("sugars_100g"),
            "sat_fat_g": nutriments.get("saturated-fat_100g"),
            "sodium_mg": computed_sodium,
            "fiber_g": nutriments.get("fiber_100g"),
            "protein_g": nutriments.get("proteins_100g"),
        }
    }


def _map_ingredients(raw_ingredients: list) -> list[dict]:
    """Maps OpenFoodFacts' ingredient list to our Ingredient schema, flagging known allergens."""
    mapped = []
    for ing in raw_ingredients:
        mapped.append({
            "name": ing.get("text", "").strip(),
            "is_allergen": _check_known_allergen(ing.get("text", "")),
        })
    return mapped


def _check_known_allergen(ingredient_name: str) -> bool:
    """Placeholder - real logic cross-references against the rule-based allergen list."""
    return False


def _validate_product(mapped: dict) -> None:
    """
    Prevents invalid product data from being stored per the Definition of Done.
    Raises ValueError if required fields are missing.
    """
    if not mapped.get("barcode"):
        raise ValueError("Cannot store product without a barcode")


def _store_product(db: Session, mapped: dict) -> dict:
    """Inserts product into PostgreSQL cache and returns stored item."""
    db.execute(
        """
        INSERT INTO product (barcode, product_name, brand, category, image_url, ingredients_text)
        VALUES (:barcode, :product_name, :brand, :category, :image_url, :ingredients_raw_text)
        ON CONFLICT (barcode) DO NOTHING
        """,
        {
            "barcode": mapped["barcode"],
            "product_name": mapped["product_name"],
            "brand": mapped["brand"],
            "category": mapped["category"],
            "image_url": mapped["image_url"],
            "ingredients_raw_text": mapped["ingredients_raw_text"],
        }
    )
    db.commit()
    return mapped
