from pydantic import BaseModel
from typing import Optional


class BarcodeScanRequest(BaseModel):
    barcode: str


class IngredientOut(BaseModel):
    name: str
    is_allergen: bool


class ProductOut(BaseModel):
    product_id: int
    barcode: str
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    ingredients: list[IngredientOut] = []


class BarcodeScanResponse(BaseModel):
    product: ProductOut
    # Placeholders below — filled in once ScanOrchestrator (Issue #57) is wired
    # into this route. For Issue #59's scope, product lookup + storage is the
    # focus; full scan result assembly happens when these two issues connect.
    safety_result: Optional[str] = None
    flagged_ingredients: list[str] = []
    nutri_score_grade: Optional[str] = None


class ProductNotFoundResponse(BaseModel):
    error: str = "Product not found"
    suggest_ocr: bool = True


class ExternalServiceErrorResponse(BaseModel):
    error: str
