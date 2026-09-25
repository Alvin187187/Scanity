from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas.scan import BarcodeScanRequest, BarcodeScanResponse, NutritionOut, ProductOut
from app.services.barcode_lookup_service import (
    get_product_by_barcode,
    ProductNotFoundError,
)
from app.services.openfoodfacts_service import OpenFoodFactsError
from app.services.scan_analysis_service import analyze_ingredients

router = APIRouter()


@router.post("/scan/barcode", response_model=BarcodeScanResponse)
async def scan_barcode(
    request: BarcodeScanRequest,
    _current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        product = await get_product_by_barcode(db, request.barcode)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid barcode format")
    except ProductNotFoundError:
        raise HTTPException(
            status_code=404,
            detail={"error": "Product not found", "suggest_ocr": True},
        )
    except OpenFoodFactsError as e:
        raise HTTPException(status_code=503, detail={"error": str(e)})

    ingredient_names = [item["name"] for item in product.get("ingredients") or [] if item.get("name")]
    if not ingredient_names and product.get("ingredients_raw_text"):
        from app.services.ocr_service import clean_ingredient_text

        ingredient_names = clean_ingredient_text(product["ingredients_raw_text"])

    analysis = analyze_ingredients(
        ingredient_names,
        request.user_allergies,
        product.get("nutrition"),
        request.user_conditions,
        use_hosted_ai=True,
        nutri_score_hint=product.get("nutriscore_grade"),
    )

    nutrition = product.get("nutrition") or {}
    nutrition_out = None
    if any(nutrition.get(key) is not None for key in NutritionOut.model_fields):
        nutrition_out = NutritionOut(
            energy_kj=nutrition.get("energy_kj"),
            sugars_g=nutrition.get("sugars_g"),
            sat_fat_g=nutrition.get("sat_fat_g"),
            sodium_mg=nutrition.get("sodium_mg"),
            fiber_g=nutrition.get("fiber_g"),
            protein_g=nutrition.get("protein_g"),
        )
    product_out = ProductOut(
        product_id=product["product_id"],
        barcode=product["barcode"],
        product_name=product["product_name"],
        brand=product.get("brand"),
        category=product.get("category"),
        image_url=product.get("image_url"),
        ingredients_raw_text=product.get("ingredients_raw_text"),
        ingredients=product.get("ingredients") or [],
        nutrition=nutrition_out,
    )
    return BarcodeScanResponse(
        product=product_out,
        allergy_flags=analysis["allergy_flags"],
        allergy_matches=analysis["allergy_matches"],
        label_insights=analysis.get("label_insights") or [],
        verdict=analysis["verdict"],
        safety_score=analysis["safety_score"],
        nutri_score_grade=analysis["nutri_score_grade"],
        explanation=analysis["explanation"],
        ai_source=analysis.get("ai_source"),
    )
