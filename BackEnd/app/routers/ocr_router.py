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


def _with_analysis(parsed: dict, user_allergies: list[str], product_name: str | None = None) -> OCRScanResponse:
    analysis = analyze_ingredients(parsed["parsed_ingredients"], user_allergies)
    return OCRScanResponse(
        extracted_text=parsed["extracted_text"],
        parsed_ingredients=parsed["parsed_ingredients"],
        allergy_flags=analysis["allergy_flags"],
        allergy_matches=analysis["allergy_matches"],
        score=analysis["nutri_score_grade"],
        verdict=analysis["verdict"],
        nutri_score_grade=analysis["nutri_score_grade"],
        explanation=analysis["explanation"],
        product_name=product_name,
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

    return _with_analysis(result, request.user_allergies, request.product_name)


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
        result = process_ocr_result(extracted_text=extracted_text)
    except InvalidLabelImageError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except OCREngineUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except InvalidOCRInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return _with_analysis(result, allergies)
