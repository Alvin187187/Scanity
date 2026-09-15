"""
Health Profile API - GET/PUT /users/me.
Built against existing models in app/models/schema.py.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete, insert
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.schema import (
    User, HealthProfile, AllergyType, HealthConditionType,
    user_allergies, user_health_conditions
)
from app.schemas.user_profile import (
    UserProfileResponse, UserProfileUpdateRequest, AllergyItem
)

router = APIRouter()

def _fetch_allergies(db: Session, user_id) -> list[AllergyItem]:
    rows = db.execute(
        select(AllergyType.allergen_name, user_allergies.c.severity)
        .join(user_allergies, user_allergies.c.allergy_type_id == AllergyType.allergy_type_id)
        .where(user_allergies.c.user_id == user_id)
    ).all()
    return [AllergyItem(allergen_name=r.allergen_name, severity=r.severity) for r in rows]

def _fetch_health_conditions(db: Session, user_id) -> list[str]:
    rows = db.execute(
        select(HealthConditionType.condition_name)
        .join(user_health_conditions, user_health_conditions.c.condition_type_id == HealthConditionType.condition_type_id)
        .where(user_health_conditions.c.user_id == user_id)
    ).all()
    return [r.condition_name for r in rows]

@router.get("/users/me", response_model=UserProfileResponse)
async def get_profile(
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return UserProfileResponse(
        user_id=user.user_id,
        full_name=user.full_name,
        email=user.email,
        allergies=_fetch_allergies(db, user_id),
        health_conditions=_fetch_health_conditions(db, user_id),
    )

@router.put("/users/me", response_model=UserProfileResponse)
async def update_profile(
    request: UserProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if (
        request.full_name is None
        and request.allergies is None
        and request.health_conditions is None
    ):
        raise HTTPException(
            status_code=422, 
            detail="Request body must include at least one field to update"
        )

    if request.full_name is not None and request.full_name.strip() == "":
        raise HTTPException(status_code=422, detail="full_name cannot be empty")

    if db.get(HealthProfile, user_id) is None:
        db.add(HealthProfile(user_id=user_id))
        db.flush()

    if request.full_name is not None:
        user.full_name = request.full_name

    if request.allergies is not None:
        known_types = {
            row.allergen_name: row.allergy_type_id
            for row in db.execute(select(AllergyType.allergen_name, AllergyType.allergy_type_id)).all()
        }
        unknown = [a.allergen_name for a in request.allergies if a.allergen_name not in known_types]
        if unknown:
            db.rollback()
            raise HTTPException(
                status_code=422,
                detail={"error": "Unknown allergy category", "unknown_categories": unknown},
            )

        db.execute(delete(user_allergies).where(user_allergies.c.user_id == user_id))
        if request.allergies:
            db.execute(
                insert(user_allergies),
                [
                    {
                        "user_id": user_id, 
                        "allergy_type_id": known_types[a.allergen_name], 
                        "severity": a.severity
                    }
                    for a in request.allergies
                ],
            )

    if request.health_conditions is not None:
        known_conditions = {
            row.condition_name: row.condition_type_id
            for row in db.execute(select(HealthConditionType.condition_name, HealthConditionType.condition_type_id)).all()
        }
        unknown_conditions = [c for c in request.health_conditions if c not in known_conditions]
        if unknown_conditions:
            db.rollback()
            raise HTTPException(
                status_code=422,
                detail={"error": "Unknown health condition category", "unknown_categories": unknown_conditions},
            )

        db.execute(delete(user_health_conditions).where(user_health_conditions.c.user_id == user_id))
        if request.health_conditions:
            db.execute(
                insert(user_health_conditions),
                [{"user_id": user_id, "condition_type_id": known_conditions[c]} for c in request.health_conditions],
            )

    db.commit()
    return UserProfileResponse(
        user_id=user.user_id,
        full_name=user.full_name,
        email=user.email,
        allergies=_fetch_allergies(db, user_id),
        health_conditions=_fetch_health_conditions(db, user_id),
    )