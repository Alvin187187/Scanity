from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class AllergyItem(BaseModel):
    allergen_name: str
    severity: Optional[str] = None  # matches user_allergies.severity


class HealthConditionItem(BaseModel):
    condition_name: str


class UserProfileResponse(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    allergies: list[AllergyItem] = []
    health_conditions: list[HealthConditionItem] = []


class UserProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    # Full replace of the allergy/condition list, not incremental add/remove —
    # simplest to reason about given these are association-table rows.
    # If None, that section is left untouched; if an empty list, it clears all.
    allergies: Optional[list[AllergyItem]] = None
    health_conditions: Optional[list[str]] = None  # list of condition_name strings