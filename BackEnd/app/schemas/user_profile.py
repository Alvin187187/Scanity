from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class AllergyItem(BaseModel):
    allergen_name: str
    severity: Optional[str] = None


class UserProfileResponse(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    allergies: list[AllergyItem] = Field(default_factory=list)
    health_conditions: list[str] = Field(default_factory=list)
    other_allergy: Optional[str] = None
    other_condition: Optional[str] = None


class UserProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    allergies: Optional[list[AllergyItem]] = None
    health_conditions: Optional[list[str]] = None
    other_allergy: Optional[str] = None
    other_condition: Optional[str] = None
