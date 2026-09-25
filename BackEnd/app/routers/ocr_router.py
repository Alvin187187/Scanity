from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from app.dependencies.auth import get_current_user

from app.schemas.ocr import OCRScanRequest, OCRScanResponse
from app.services.ocr_service import (
    InvalidOCRInputError,
    process_ocr_result,
)
from app.services.rapidocr_service import (
    InvalidLabelImageError,
    OCREngineUnavailableError,
    extract_text_from_image,
)
from app.services.scan_analysis_service import analyze_ingredients


router = APIRouter()


def _map_request_to_service(request: OCRScanRequest) -> dict:
    return {
        "extracted_text": request.extracted_text or "",
        "confirmed_ingredients": request.confirmed_ingredients,
        "edited_ingredients": request.edited_ingredients,
    }


def _with_analysis(
    parsed: dict,
    user_allergies: list[str],
    product_name: str | None = None,
    user_conditions: list[str] | None = None,
) -> OCRScanResponse:
    ingredients = parsed.get("parsed_ingredients") or []
    if ingredients:
        analysis = analyze_ingredients(
            ingredients,
            user_allergies,
            user_conditions=user_conditions or [],
            use_hosted_ai=True,
        )
    else:
        analysis = {
            "allergy_flags": [],
            "allergy_matches": [],
            "label_insights": [],
            "verdict": None,
            "safety_score": None,
            "nutri_score_grade": None,
            "explanation": None,
            "ai_source": None,
        }
    return OCRScanResponse(
        extracted_text=parsed["extracted_text"],
        parsed_ingredients=ingredients,
        allergy_flags=analysis["allergy_flags"],
        allergy_matches=analysis["allergy_matches"],
        label_insights=analysis.get("label_insights") or [],
        score=analysis["nutri_score_grade"],
        verdict=analysis["verdict"],
        safety_score=analysis.get("safety_score"),
        nutri_score_grade=analysis["nutri_score_grade"],
        explanation=analysis["explanation"],
        product_name=product_name,
        ai_source=analysis.get("ai_source"),
    )


@router.post("/scan/ocr", response_model=OCRScanResponse)
async def scan_ocr(
    request: OCRScanRequest,
    _current_user: dict = Depends(get_current_user),
):
    try:
        result = process_ocr_result(**_map_request_to_service(request))
    except InvalidOCRInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return _with_analysis(
        result,
        request.user_allergies,
        request.product_name,
        request.user_conditions,
    )


@router.post("/scan/ocr/image", response_model=OCRScanResponse)
async def scan_ocr_image(
    file: UploadFile = File(...),
    user_allergies: str = Form(""),
    _current_user: dict = Depends(get_current_user),
):
    """Read a nutrition-label photo with RapidOCR PP-OCRv5, then analyze it."""
    image_bytes = await file.read()
    allergies = [part.strip() for part in user_allergies.split(",") if part.strip()]
    try:
        extracted_text = extract_text_from_image(image_bytes, file.content_type)
        # Allow empty ingredient lists so the client can show a review/edit step.
        result = process_ocr_result(
            extracted_text=extracted_text,
            require_ingredients=False,
        )
    except InvalidLabelImageError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except OCREngineUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except InvalidOCRInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return _with_analysis(result, allergies)
