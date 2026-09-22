# app/services/barcode_lookup_service.py
"""
Orchestrates barcode product lookup: local cache check -> OpenFoodFacts fallback ->
mapping -> validation -> storage.

Database cache/store is best-effort. Open Food Facts results must still return
even when the local products table is missing, truncated, or otherwise rejects
the write — that was surfacing as "A database operation failed." on phones.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError

from app.services.openfoodfacts_service import OpenFoodFactsError, fetch_product_by_barcode

logger = logging.getLogger(__name__)

# Match BackEnd/app/models/schema.py column lengths.
_MAX_PRODUCT_NAME = 200
_MAX_BRAND = 25
_MAX_CATEGORY = 25
_MAX_INGREDIENT_NAME = 100


class ProductNotFoundError(Exception):
    """Raised when the barcode isn't found locally OR on OpenFoodFacts."""
    pass


def validate_barcode(barcode: str) -> bool:
    """Basic format check before any lookup — barcodes are numeric, typically 8-13 digits."""
    return barcode.isdigit() and 8 <= len(barcode) <= 14


def _clip(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


async def get_product_by_barcode(db, barcode: str) -> dict:
    """
    Main entry point. Returns a dict matching the Product schema.
    Raises ProductNotFoundError (caller returns 404 + suggest_ocr:true) or
    OpenFoodFactsError (caller returns 503-style error, distinct from not-found).
    """
    if not validate_barcode(barcode):
        raise ValueError("Invalid barcode format")

    # 1. Cache check — best-effort. A broken/missing products table must not
    # block live Open Food Facts lookups.
    cached = _safe_get_local_product(db, barcode)
    if cached:
        if cached.get("nutrition") is None or not cached.get("image_url"):
            try:
                raw_product = await fetch_product_by_barcode(barcode)
            except OpenFoodFactsError:
                return cached
            if raw_product:
                return _enrich_cached_product(cached, raw_product, barcode)
        return cached

    # 2. Not cached -> call OpenFoodFacts
    try:
        raw_product = await fetch_product_by_barcode(barcode)
    except OpenFoodFactsError:
        raise

    if raw_product is None:
        raise ProductNotFoundError(barcode)

    # 3. Map, validate, try to store (optional)
    mapped = _map_openfoodfacts_to_product_schema(raw_product, barcode)
    _validate_product(mapped)
    stored = _safe_store_product(db, mapped)
    if stored:
        return _merge_live_fields(stored, mapped)
    return _ephemeral_product(mapped)


def _enrich_cached_product(cached: dict, raw_product: dict, barcode: str) -> dict:
    mapped = _map_openfoodfacts_to_product_schema(raw_product, barcode)
    return _merge_live_fields(cached, mapped)


def _merge_live_fields(base: dict, mapped: dict) -> dict:
    enriched = dict(base)
    if mapped.get("nutrition") is not None:
        enriched["nutrition"] = mapped.get("nutrition")
    if mapped.get("image_url"):
        enriched["image_url"] = mapped.get("image_url")
    if mapped.get("ingredients_raw_text") and not enriched.get("ingredients_raw_text"):
        enriched["ingredients_raw_text"] = mapped.get("ingredients_raw_text")
    if mapped.get("ingredients") and not enriched.get("ingredients"):
        enriched["ingredients"] = mapped.get("ingredients")
    if mapped.get("nutriscore_grade"):
        enriched["nutriscore_grade"] = mapped.get("nutriscore_grade")
    return enriched


def _ephemeral_product(mapped: dict) -> dict:
    """OFF payload shaped like a ProductOut when the local DB cannot store it."""
    return {
        "product_id": uuid.uuid5(uuid.NAMESPACE_URL, f"scanity:barcode:{mapped['barcode']}"),
        "barcode": mapped["barcode"],
        "product_name": mapped.get("product_name") or "Unknown product",
        "brand": mapped.get("brand"),
        "category": mapped.get("category"),
        "ingredients_raw_text": mapped.get("ingredients_raw_text"),
        "image_url": mapped.get("image_url"),
        "nutrition": mapped.get("nutrition"),
        "ingredients": mapped.get("ingredients") or [],
    }


def _safe_get_local_product(db, barcode: str) -> Optional[dict]:
    try:
        return _get_local_product(db, barcode)
    except SQLAlchemyError:
        logger.warning("Local barcode cache read failed; continuing with Open Food Facts.")
        try:
            db.rollback()
        except Exception:
            pass
        return None


def _safe_store_product(db, mapped: dict) -> Optional[dict]:
    try:
        return _store_product(db, mapped)
    except SQLAlchemyError:
        logger.warning("Local barcode cache write failed; returning live Open Food Facts data.")
        try:
            db.rollback()
        except Exception:
            pass
        return None


def _get_local_product(db, barcode: str) -> Optional[dict]:
    """Cache lookup — direct query against the ERD `products` table by barcode."""
    from app.models.schema import Product

    product = db.query(Product).filter(Product.barcode == barcode).first()
    if not product:
        return None

    return {
        "product_id": product.product_id,
        "barcode": product.barcode,
        "product_name": product.product_name,
        "brand": product.brand,
        "category": product.category,
        "ingredients_raw_text": product.ingredients_raw_text,
        "image_url": None,
        "nutrition": None,
        "ingredients": [
            {"name": ing.ingredient_name, "is_allergen": bool(ing.is_allergen)}
            for ing in product.ingredients
        ],
    }


def _off_nutri_grade(raw: dict) -> str | None:
    grade = str(raw.get("nutriscore_grade") or raw.get("nutrition_grades") or "").strip().lower()
    letter = grade[:1]
    return letter if letter in {"a", "b", "c", "d", "e"} else None


def _energy_kj(nutriments: dict) -> float | None:
    kj = nutriments.get("energy-kj_100g")
    if kj is not None:
        return kj
    kcal = nutriments.get("energy-kcal_100g")
    if kcal is not None:
        try:
            return float(kcal) * 4.184
        except (TypeError, ValueError):
            return None
    return nutriments.get("energy_100g")


def _map_openfoodfacts_to_product_schema(raw: dict, barcode: str) -> dict:
    """
    Normalizes OpenFoodFacts' raw response into Scanity's Product schema.
    OpenFoodFacts field names -> our schema field names, with missing-field handling.
    """
    nutriments = raw.get("nutriments", {}) or {}
    brand = raw.get("brands", "").split(",")[0].strip() if raw.get("brands") else None
    category = raw.get("categories", "").split(",")[0].strip() if raw.get("categories") else None
    from app.services.ingredient_language import prefer_english_ingredients_text

    ingredients_raw, _translated = prefer_english_ingredients_text(raw)

    mapped_ingredients = _map_ingredients(raw.get("ingredients") or [])
    if not mapped_ingredients and ingredients_raw:
        from app.services.ocr_service import clean_ingredient_text

        mapped_ingredients = [
            {"name": name, "is_allergen": _check_known_allergen(name)}
            for name in clean_ingredient_text(ingredients_raw)
        ]

    return {
        "barcode": barcode,
        "product_name": _clip(
            raw.get("product_name_en") or raw.get("product_name") or "Unknown product",
            _MAX_PRODUCT_NAME,
        )
        or "Unknown product",
        "brand": _clip(brand, _MAX_BRAND),
        "category": _clip(category, _MAX_CATEGORY),
        "image_url": raw.get("image_url") or raw.get("image_front_url"),
        "ingredients_raw_text": ingredients_raw,
        "ingredients": mapped_ingredients,
        "nutriscore_grade": _off_nutri_grade(raw),
        "nutrition": {
            "energy_kj": _energy_kj(nutriments),
            "energy_kcal": nutriments.get("energy-kcal_100g"),
            "sugars_g": nutriments.get("sugars_100g"),
            "sat_fat_g": nutriments.get("saturated-fat_100g"),
            "sodium_mg": nutriments.get("sodium_100g", 0) * 1000
            if nutriments.get("sodium_100g") is not None
            else None,
            "fiber_g": nutriments.get("fiber_100g"),
            "protein_g": nutriments.get("proteins_100g"),
        },
    }


def _map_ingredients(raw_ingredients: list) -> list[dict]:
    """Maps OpenFoodFacts' ingredient list to our Ingredient schema, flagging known allergens."""
    from app.services.ingredient_language import prefer_english_ingredient

    mapped = []
    for ing in raw_ingredients:
        english_name, _translated = prefer_english_ingredient(ing)
        name = _clip(english_name or str(ing.get("id") or ""), _MAX_INGREDIENT_NAME)
        if not name:
            continue
        mapped.append(
            {
                "name": name,
                "is_allergen": _check_known_allergen(name),
            }
        )
    return mapped


def _check_known_allergen(ingredient_name: str) -> bool:
    """True when the ingredient maps to a known allergen category in the seed table."""
    try:
        from app.core.repo_path import ensure_repo_root

        ensure_repo_root()
        from ai.allergy_engine import check_allergies

        flags = check_allergies([], [ingredient_name])
        if not flags:
            return False
        return flags[0].get("matched_category") is not None
    except Exception:
        return False


def _validate_product(mapped: dict) -> None:
    if not mapped.get("barcode"):
        raise ValueError("Cannot store product without a barcode")


def _store_product(db, mapped: dict) -> dict:
    """
    Inserts the product (and related Ingredient/ProductIngredient rows) if not
    already present. Prevents duplicates via the UNIQUE constraint on barcode.
    """
    from app.models.schema import Ingredient, Product

    existing = db.query(Product).filter(Product.barcode == mapped["barcode"]).first()
    if existing:
        return _get_local_product(db, mapped["barcode"])

    product = Product(
        barcode=mapped["barcode"],
        product_name=_clip(mapped.get("product_name"), _MAX_PRODUCT_NAME) or "Unknown product",
        brand=_clip(mapped.get("brand"), _MAX_BRAND),
        category=_clip(mapped.get("category"), _MAX_CATEGORY),
        ingredients_raw_text=mapped.get("ingredients_raw_text"),
    )

    for ing_data in mapped.get("ingredients", []):
        name = _clip(ing_data.get("name"), _MAX_INGREDIENT_NAME)
        if not name:
            continue
        ingredient = db.query(Ingredient).filter(Ingredient.ingredient_name == name).first()
        if not ingredient:
            ingredient = Ingredient(
                ingredient_name=name,
                is_allergen=bool(ing_data.get("is_allergen")),
            )
            db.add(ingredient)
        product.ingredients.append(ingredient)

    db.add(product)
    db.commit()
    db.refresh(product)

    return _get_local_product(db, product.barcode)
