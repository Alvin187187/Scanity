from pydantic import BaseModel, Field
from typing import Optional


class OCRScanRequest(BaseModel):
    """
    Temporary API contract for Issue #150.

    This schema is intentionally separate so it can be changed easily
    once the team finalizes the OCR API contract.
    """

    confirmed_ingredients: Optional[list[str]] = None
    edited_ingredients: Optional[list[str]] = None

    # Reserved for RapidOCR integration later.
    extracted_text: Optional[str] = None


class OCRScanResponse(BaseModel):
    extracted_text: str = ""
    parsed_ingredients: list[str] = Field(default_factory=list)

    # Placeholders until the related engine tickets are connected.
    allergy_flags: list[str] = Field(default_factory=list)
    score: Optional[str] = None