from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID

from app.schemas.ocr import AllergyMatchOut, LabelInsightOut


class BarcodeScanRequest(BaseModel):
    barcode: str
    user_allergies: list[str] = Field(default_factory=list)
    user_conditions: list[str] = Field(default_factory=list)


class IngredientOut(BaseModel):
    name: str
    is_allergen: bool


class NutritionOut(BaseModel):
    energy_kj: Optional[float] = None
    sugars_g: Optional[float] = None
    sat_fat_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    fiber_g: Optional[float] = None
    protein_g: Optional[float] = None


class ProductOut(BaseModel):
    product_id: UUID
    barcode: str
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    ingredients_raw_text: Optional[str] = None
    ingredients: list[IngredientOut] = Field(default_factory=list)
    nutrition: Optional[NutritionOut] = None


class BarcodeScanResponse(BaseModel):
    product: ProductOut
    allergy_flags: list[str] = Field(default_factory=list)
    allergy_matches: list[AllergyMatchOut] = Field(default_factory=list)
    label_insights: list[LabelInsightOut] = Field(default_factory=list)
    verdict: Optional[str] = None
    safety_score: Optional[int] = None
    nutri_score_grade: Optional[str] = None
    explanation: Optional[str] = None
    ai_source: Optional[str] = None


class ProductNotFoundResponse(BaseModel):
    error: str = "Product not found"
    suggest_ocr: bool = True


class ExternalServiceErrorResponse(BaseModel):
    error: str
