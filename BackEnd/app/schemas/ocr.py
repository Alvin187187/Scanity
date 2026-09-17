from pydantic import BaseModel, Field
from typing import Optional


class AllergyMatchOut(BaseModel):
    ingredient: str
    status: str
    matched_category: Optional[str] = None
    matched_kb_entry: Optional[str] = None
    reason: str = ""


class OCRScanRequest(BaseModel):
    """JSON contract for OCR analysis after text is already extracted."""

    confirmed_ingredients: Optional[list[str]] = None
    edited_ingredients: Optional[list[str]] = None
    extracted_text: Optional[str] = None
    user_allergies: list[str] = Field(default_factory=list)
    product_name: Optional[str] = None


class OCRScanResponse(BaseModel):
    extracted_text: str = ""
    parsed_ingredients: list[str] = Field(default_factory=list)
    allergy_flags: list[str] = Field(default_factory=list)
    allergy_matches: list[AllergyMatchOut] = Field(default_factory=list)
    score: Optional[str] = None
    verdict: Optional[str] = None
    nutri_score_grade: Optional[str] = None
    explanation: Optional[str] = None
    product_name: Optional[str] = None
