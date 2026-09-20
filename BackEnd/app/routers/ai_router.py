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
