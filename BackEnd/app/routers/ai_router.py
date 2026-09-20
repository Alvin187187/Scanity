"""AI assistant endpoints — chat Q&A and personalized safety reports.

Gemini explains only. It never changes Safe / Caution / Avoid.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_user
from app.services.ai_assistant_service import (
    answer_product_question,
    build_safety_report,
)
from app.services.ingredient_explain_service import explain_ingredient

router = APIRouter()


class ProductContextIn(BaseModel):
    product_name: str | None = None
    brand: str | None = None
    barcode: str | None = None
    verdict: str | None = None
    safety_score: int | None = None
    nutri_score_grade: str | None = None
    explanation: str | None = None
    ingredients: list[str] = Field(default_factory=list)
    allergy_flags: list[str] = Field(default_factory=list)
    allergy_matches: list[dict] = Field(default_factory=list)


class ProfileContextIn(BaseModel):
    allergies: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)


class AiChatRequest(BaseModel):
    message: str
    product: ProductContextIn = Field(default_factory=ProductContextIn)
    profile: ProfileContextIn = Field(default_factory=ProfileContextIn)
    history: list[dict] = Field(default_factory=list)


class AiChatResponse(BaseModel):
    reply: str


class SafetyReportRequest(BaseModel):
    product: ProductContextIn = Field(default_factory=ProductContextIn)
    profile: ProfileContextIn = Field(default_factory=ProfileContextIn)
    focus: str | None = None


class SafetyReportResponse(BaseModel):
    report: str


class IngredientExplainRequest(BaseModel):
    ingredient: str
    product_name: str | None = None
    conditions: list[str] = Field(default_factory=list)


class IngredientExplainResponse(BaseModel):
    ingredient: str
    title: str
    category: str = ""
    what_it_is: str = ""
    commonly_seen_in: str = ""
    possible_effects: str = ""
    affects_allergens: list[str] = Field(default_factory=list)
    affects_diets: list[str] = Field(default_factory=list)
    source: str = ""
    aliases: list[str] = Field(default_factory=list)
    ai_source: str = "knowledge"


@router.post("/scan/ai/chat", response_model=AiChatResponse)
async def ai_chat(
    request: AiChatRequest,
    _current_user: dict = Depends(get_current_user),
):
    reply = answer_product_question(
        message=request.message,
        product=request.product.model_dump(),
        profile=request.profile.model_dump(),
        history=request.history,
    )
    return AiChatResponse(reply=reply)


@router.post("/scan/ai/safety-report", response_model=SafetyReportResponse)
async def ai_safety_report(
    request: SafetyReportRequest,
    _current_user: dict = Depends(get_current_user),
):
    report = build_safety_report(
        product=request.product.model_dump(),
        profile=request.profile.model_dump(),
        focus=request.focus,
    )
    return SafetyReportResponse(report=report)


@router.post("/scan/ai/ingredient-explain", response_model=IngredientExplainResponse)
async def ai_ingredient_explain(
    request: IngredientExplainRequest,
    _current_user: dict = Depends(get_current_user),
):
    data = explain_ingredient(
        request.ingredient,
        product_name=request.product_name,
        profile_conditions=request.conditions,
    )
    return IngredientExplainResponse(**data)
