# app/services/barcode_lookup_service.py
"""
Orchestrates barcode product lookup: local cache check -> OpenFoodFacts fallback ->
mapping -> validation -> storage. This is what ScanOrchestrator calls for FR-01
barcode scans.
"""
from typing import Optional
from app.services.openfoodfacts_service import fetch_product_by_barcode, OpenFoodFactsError


class ProductNotFoundError(Exception):
    """Raised when the barcode isn't found locally OR on OpenFoodFacts."""
    pass


def validate_barcode(barcode: str) -> bool:
    """Basic format check before any lookup — barcodes are numeric, typically 8-13 digits."""
    return barcode.isdigit() and 8 <= len(barcode) <= 13


async def get_product_by_barcode(db, barcode: str) -> dict:
    """
    Main entry point. Returns a dict matching the Product schema.
    Raises ProductNotFoundError (caller returns 404 + suggest_ocr:true) or
    OpenFoodFactsError (caller returns 503-style error, distinct from not-found).
    """
    if not validate_barcode(barcode):
        raise ValueError("Invalid barcode format")

    # 1. Cache check — local DB is the cache, per the Definition of Done
    cached = _get_local_product(db, barcode)
    if cached:
        return cached

    # 2. Not cached -> call OpenFoodFacts
    try:
        raw_product = await fetch_product_by_barcode(barcode)
    except OpenFoodFactsError:
        # Distinguish external-service-failure from genuine not-found —
        # caller must not conflate these into the same response
        raise

    if raw_product is None:
        raise ProductNotFoundError(barcode)

    # 3. Map, validate, store
    mapped = _map_openfoodfacts_to_product_schema(raw_product, barcode)
    _validate_product(mapped)
    stored = _store_product(db, mapped)
    return stored


def _get_local_product(db, barcode: str) -> Optional[dict]:
    """Cache lookup — direct query against the `product` table by barcode."""
    from app.models.product import Product

    product = db.query(Product).filter(Product.barcode == barcode).first()
    if not product:
        return None

    return {
        "product_id": product.product_id,
        "barcode": product.barcode,
        "product_name": product.product_name,
        "brand": product.brand,
        "category": product.category,
        "ingredients": [
            {"name": ing.ingredient_name, "is_allergen": bool(ing.is_allergen)}
            for ing in product.ingredients
        ],
    }


def _map_openfoodfacts_to_product_schema(raw: dict, barcode: str) -> dict:
    """
    Normalizes OpenFoodFacts' raw response into Scanity's Product schema.
    OpenFoodFacts field names -> our schema field names, with missing-field handling.
    """
    nutriments = raw.get("nutriments", {})

    return {
        "barcode": barcode,
        "product_name": raw.get("product_name") or raw.get("product_name_en") or "Unknown product",
        "brand": raw.get("brands", "").split(",")[0].strip() if raw.get("brands") else None,
        "category": raw.get("categories", "").split(",")[0].strip() if raw.get("categories") else None,
        "image_url": raw.get("image_url"),
        "ingredients_raw_text": raw.get("ingredients_text", ""),  # for OCR-parity/fallback display
        "ingredients": _map_ingredients(raw.get("ingredients", [])),
        # Per-100g/100mL normalized values, required for Nutri-Score (Issue #57)
        "nutrition": {
            "energy_kj": nutriments.get("energy-kj_100g"),
            "sugars_g": nutriments.get("sugars_100g"),
            "sat_fat_g": nutriments.get("saturated-fat_100g"),
            "sodium_mg": nutriments.get("sodium_100g", 0) * 1000 if nutriments.get("sodium_100g") is not None else None,
            "fiber_g": nutriments.get("fiber_100g"),
            "protein_g": nutriments.get("proteins_100g"),
        },
    }


def _map_ingredients(raw_ingredients: list) -> list[dict]:
    """Maps OpenFoodFacts' ingredient list to our Ingredient schema, flagging known allergens."""
    mapped = []
    for ing in raw_ingredients:
        mapped.append({
            "name": ing.get("text", "").strip(),
            "is_allergen": bool(ing.get("vegan") == "no" and False) or _check_known_allergen(ing.get("text", "")),
        })
    return mapped


def _check_known_allergen(ingredient_name: str) -> bool:
    """Placeholder — real logic cross-references against the rule-based allergen list (Issue #57)."""
    return False


def _validate_product(mapped: dict) -> None:
    """
    Prevents invalid product data from being stored per the Definition of Done.
    Raises ValueError if required fields are missing.
    """
    if not mapped.get("product_name") or mapped["product_name"] == "Unknown product":
        pass  # allowed to store with a placeholder name — OFF data is often incomplete
    if not mapped.get("barcode"):
        raise ValueError("Cannot store product without a barcode")
    # Nutrition completeness is checked separately by NutritionScoreService (422 if
    # insufficient for Nutri-Score) — not a hard block at storage time, since a
    # product can still be stored and allergy-matched even with incomplete nutrition data


def _store_product(db, mapped: dict) -> dict:
    """
    Inserts the product (and related Ingredient/ProductIngredient rows) if not
    already present. Prevents duplicates via the UNIQUE constraint on barcode.
    """
    from app.models.product import Product, Ingredient

    product = Product(
        barcode=mapped["barcode"],
        product_name=mapped["product_name"],
        brand=mapped.get("brand"),
        category=mapped.get("category"),
        ingredients_raw_text=mapped.get("ingredients_raw_text"),
    )

    for ing_data in mapped.get("ingredients", []):
        name = ing_data["name"]
        if not name:
            continue
        # Reuse an existing Ingredient row with the same name if one exists,
        # rather than creating duplicates every time a new product references
        # a common ingredient (e.g. "salt", "sugar")
        ingredient = db.query(Ingredient).filter(Ingredient.ingredient_name == name).first()
        if not ingredient:
            ingredient = Ingredient(
                ingredient_name=name,
                is_allergen=1 if ing_data.get("is_allergen") else 0,
            )
            db.add(ingredient)
        product.ingredients.append(ingredient)

    db.add(product)
    db.commit()
    db.refresh(product)

    return _get_local_product(db, product.barcode)
