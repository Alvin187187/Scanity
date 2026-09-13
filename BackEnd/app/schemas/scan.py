from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class BarcodeScanRequest(BaseModel):
    barcode: str


class IngredientOut(BaseModel):
    name: str
    is_allergen: bool


class ProductOut(BaseModel):
    product_id: UUID
    barcode: str
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    ingredients: list[IngredientOut] = Field(default_factory=list)


class BarcodeScanResponse(BaseModel):
    product: ProductOut

    # Intentionally empty for Issue #149.
    # Real allergy flags will be added in Issue #153.
    allergy_flags: list[str] = Field(default_factory=list)
    verdict: Optional[str] = None
    nutri_score_grade: Optional[str] = None


class ProductNotFoundResponse(BaseModel):
    error: str = "Product not found"
    suggest_ocr: bool = True


class ExternalServiceErrorResponse(BaseModel):
    error: str