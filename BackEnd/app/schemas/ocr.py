from pydantic import BaseModel, Field
from typing import Optional


class AllergyMatchOut(BaseModel):
    ingredient: str
    status: str
    matched_category: Optional[str] = None
    matched_kb_entry: Optional[str] = None
    reason: str = ""
    plain_explanation: Optional[str] = None
    knowledge: Optional[dict] = None


class LabelInsightOut(BaseModel):
    ingredient: str
    title: str
    category: str = ""
    what_it_is: str = ""
    commonly_seen_in: str = ""
    possible_effects: str = ""
    source: str = ""
    aliases: list[str] = Field(default_factory=list)
    needs_ai: bool = False


class OCRScanRequest(BaseModel):
    """JSON contract for OCR analysis after text is already extracted."""

    confirmed_ingredients: Optional[list[str]] = None
    edited_ingredients: Optional[list[str]] = None
    extracted_text: Optional[str] = None
    user_allergies: list[str] = Field(default_factory=list)
    user_conditions: list[str] = Field(default_factory=list)
    product_name: Optional[str] = None


class OCRScanResponse(BaseModel):
    extracted_text: str = ""
    parsed_ingredients: list[str] = Field(default_factory=list)
    allergy_flags: list[str] = Field(default_factory=list)
    allergy_matches: list[AllergyMatchOut] = Field(default_factory=list)
    label_insights: list[LabelInsightOut] = Field(default_factory=list)
    score: Optional[str] = None
    verdict: Optional[str] = None
    safety_score: Optional[int] = None
    nutri_score_grade: Optional[str] = None
    explanation: Optional[str] = None
    product_name: Optional[str] = None
    ai_source: Optional[str] = None
