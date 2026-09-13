# app/routers/users.py
"""
Health Profile API — GET/PUT /users/me.
Built against the normalized schema in app/models/schema.py:
User, HealthProfile, AllergyType, HealthConditionType, user_allergies,
user_health_conditions (association tables).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete, insert
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.schema import (
    User, HealthProfile, AllergyType, HealthConditionType,
    user_allergies, user_health_conditions,
)
from app.schemas.user_profile import (
    UserProfileResponse, UserProfileUpdateRequest, AllergyItem, HealthConditionItem,
)

router = APIRouter()


def _get_or_create_health_profile(db: Session, user_id) -> HealthProfile:
    profile = db.get(HealthProfile, user_id)
    if profile is None:
        profile = HealthProfile(user_id=user_id)
        db.add(profile)
        db.commit()
    return profile


def _fetch_allergies(db: Session, user_id) -> list[AllergyItem]:
    rows = db.execute(
        select(AllergyType.allergen_name, user_allergies.c.severity)
        .join(user_allergies, user_allergies.c.allergy_type_id == AllergyType.allergy_type_id)
        .where(user_allergies.c.user_id == user_id)
    ).all()
    return [AllergyItem(allergen_name=r.allergen_name, severity=r.severity) for r in rows]


def _fetch_health_conditions(db: Session, user_id) -> list[HealthConditionItem]:
    rows = db.execute(
        select(HealthConditionType.condition_name)
        .join(user_health_conditions, user_health_conditions.c.condition_type_id == HealthConditionType.condition_type_id)
        .where(user_health_conditions.c.user_id == user_id)
    ).all()
    return [HealthConditionItem(condition_name=r.condition_name) for r in rows]


@router.get("/users/me", response_model=UserProfileResponse)
async def get_profile(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]  # NEEDS CONFIRMATION — see note below
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    _get_or_create_health_profile(db, user_id)

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
    user_id = current_user["user_id"]  # NEEDS CONFIRMATION — see note below
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    _get_or_create_health_profile(db, user_id)

    if request.full_name is not None:
        user.full_name = request.full_name

    if request.allergies is not None:
        # Validate every allergen name against the known AllergyType lookup
        # BEFORE deleting anything — per Alvin's "reject unknown allergy
        # categories" requirement. Fail the whole request if any are unknown,
        # rather than partially applying valid ones.
        known_types = {
            row.allergen_name: row.allergy_type_id
            for row in db.execute(select(AllergyType.allergen_name, AllergyType.allergy_type_id)).all()
        }
        unknown = [a.allergen_name for a in request.allergies if a.allergen_name not in known_types]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail={"error": "Unknown allergy category", "unknown_categories": unknown},
            )

        # Full replace: clear existing rows, insert the new set
        db.execute(delete(user_allergies).where(user_allergies.c.user_id == user_id))
        if request.allergies:
            db.execute(
                insert(user_allergies),
                [
                    {
                        "user_id": user_id,
                        "allergy_type_id": known_types[a.allergen_name],
                        "severity": a.severity,
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
            raise HTTPException(
                status_code=422,
                detail={"error": "Unknown health condition category", "unknown_categories": unknown_conditions},
            )

        db.execute(delete(user_health_conditions).where(user_health_conditions.c.user_id == user_id))
        if request.health_conditions:
            db.execute(
                insert(user_health_conditions),
                [
                    {"user_id": user_id, "condition_type_id": known_conditions[c]}
                    for c in request.health_conditions
                ],
            )

    db.commit()

    return UserProfileResponse(
        user_id=user.user_id,
        full_name=user.full_name,
        email=user.email,
        allergies=_fetch_allergies(db, user_id),
        health_conditions=_fetch_health_conditions(db, user_id),
    )