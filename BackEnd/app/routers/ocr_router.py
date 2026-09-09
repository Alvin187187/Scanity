from fastapi import APIRouter, HTTPException

from app.schemas.ocr import OCRScanRequest, OCRScanResponse
from app.services.ocr_service import (
    InvalidOCRInputError,
    process_ocr_result,
)


router = APIRouter()


def _map_request_to_service(request: OCRScanRequest) -> dict:
    """
    Adapter between the API contract and OCR service.

    If the frontend/API contract changes later, update this mapping
    instead of rewriting the OCR processing service.
    """

    return {
        "extracted_text": request.extracted_text or "",
        "confirmed_ingredients": request.confirmed_ingredients,
        "edited_ingredients": request.edited_ingredients,
    }


@router.post("/scan/ocr", response_model=OCRScanResponse)
async def scan_ocr(request: OCRScanRequest):
    """
    OCR scan endpoint for Issue #150.

    TODO:
    - Add authentication after Auth merges into dev.
    - Add image upload / RapidOCR after its interface is available.
    """

    try:
        service_input = _map_request_to_service(request)

        result = process_ocr_result(**service_input)

    except InvalidOCRInputError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        )

    return OCRScanResponse(**result)