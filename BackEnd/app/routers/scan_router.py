from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.scan import BarcodeScanRequest, BarcodeScanResponse, ProductOut
from app.services.barcode_lookup_service import (
    get_product_by_barcode,
    ProductNotFoundError,
)
from app.services.openfoodfacts_service import OpenFoodFactsError

router = APIRouter()


@router.post("/scan/barcode", response_model=BarcodeScanResponse)
async def scan_barcode(request: BarcodeScanRequest, db: Session = Depends(get_db)):
    try:
        product = await get_product_by_barcode(db, request.barcode)
    except ValueError:
        # Invalid barcode format — caught before any external call is attempted
        raise HTTPException(status_code=422, detail="Invalid barcode format")
    except ProductNotFoundError:
        # Genuinely not found on OpenFoodFacts — distinct from a service failure,
        # so the frontend can safely suggest the OCR fallback
        raise HTTPException(
            status_code=404,
            detail={"error": "Product not found", "suggest_ocr": True},
        )
    except OpenFoodFactsError as e:
        # OpenFoodFacts unreachable/timeout/malformed — NOT the same as
        # not-found, per Issue #55's resolved fallback behavior. Does not
        # crash the backend; returns a clear, distinct error instead.
        raise HTTPException(status_code=503, detail={"error": str(e)})

    return BarcodeScanResponse(product=ProductOut(**product))
