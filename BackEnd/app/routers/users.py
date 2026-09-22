"""Health Profile API - GET/PUT /users/me.

Persists allergies and health conditions for the signed-in Supabase user
into the existing ERD tables (health_profiles, user_allergies,
user_health_conditions). Canonical type rows are created on demand so
deploys do not depend on a separate seed job.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.schema import (
    AllergyType,
    HealthConditionType,
    HealthProfile,
    User,
    user_allergies,
    user_health_conditions,
)
from app.schemas.user_profile import (
    AllergyItem,
    UserProfileResponse,
    UserProfileUpdateRequest,
)

router = APIRouter()

CANONICAL_ALLERGENS = (
    "peanut",
    "tree_nuts",
    "milk",
    "egg",
    "wheat",
    "soy",
    "fish",
    "shellfish",
    "sesame",
)

CANONICAL_CONDITIONS = (
    "diabetes",
    "hypertension",
    "celiac",
    "lactose",
    "ibs",
    "kidney",
    "heart",
)

OTHER_ALLERGY_KEY = "__other_allergy__"
OTHER_CONDITION_KEY = "__other_condition__"


def _as_uuid(value: str | uuid.UUID) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _ensure_user(db: Session, current_user: dict) -> User:
    from app.services.auth_service import _ensure_user_columns

    _ensure_user_columns(db)
    user_id = _as_uuid(current_user["user_id"])
    user = db.execute(select(User).where(User.user_id == user_id)).scalar_one_or_none()
    if user is not None:
        return user

    email = (current_user.get("email") or "").strip() or f"{user_id}@users.scanity.local"
    full_name = (email.split("@")[0] or "Scanity user")[:120]
    user = User(user_id=user_id, email=email[:255], full_name=full_name)
    db.add(user)
    db.flush()
    return user


def _ensure_health_profile(db: Session, user_id: uuid.UUID) -> None:
    existing = db.execute(
        select(HealthProfile).where(HealthProfile.user_id == user_id)
    ).scalar_one_or_none()
    if existing is None:
        db.add(HealthProfile(user_id=user_id))
        db.flush()


def _ensure_allergen_type(db: Session, name: str) -> uuid.UUID:
    row = db.execute(
        select(AllergyType).where(AllergyType.allergen_name == name)
    ).scalar_one_or_none()
    if row is not None:
        return row.allergy_type_id
    allergy_type_id = uuid.uuid4()
    db.add(AllergyType(allergy_type_id=allergy_type_id, allergen_name=name[:50]))
    db.flush()
    return allergy_type_id


def _ensure_condition_type(db: Session, name: str) -> uuid.UUID:
    row = db.execute(
        select(HealthConditionType).where(HealthConditionType.condition_name == name)
    ).scalar_one_or_none()
    if row is not None:
        return row.condition_type_id
    condition_type_id = uuid.uuid4()
    db.add(
        HealthConditionType(
            condition_type_id=condition_type_id,
            condition_name=name[:100],
        )
    )
    db.flush()
    return condition_type_id


def _seed_canonical_types(db: Session) -> None:
    for name in CANONICAL_ALLERGENS:
        _ensure_allergen_type(db, name)
    for name in CANONICAL_CONDITIONS:
        _ensure_condition_type(db, name)


def _fetch_allergies(db: Session, user_id: uuid.UUID) -> list[AllergyItem]:
    rows = db.execute(
        select(AllergyType.allergen_name, user_allergies.c.severity)
        .join(
            user_allergies,
            user_allergies.c.allergy_type_id == AllergyType.allergy_type_id,
        )
        .where(user_allergies.c.user_id == user_id)
    ).all()
    return [
        AllergyItem(allergen_name=r.allergen_name, severity=r.severity)
        for r in rows
        if r.allergen_name
        and r.allergen_name != OTHER_ALLERGY_KEY
        and not str(r.allergen_name).startswith("other:")
    ]


def _custom_names(rows: list, prefix: str = "other:") -> list[str]:
    names: list[str] = []
    for row in rows:
        raw = getattr(row, "allergen_name", None) or getattr(row, "condition_name", None) or ""
        if raw.startswith(prefix):
            name = raw[len(prefix) :].strip()
            if name:
                names.extend(part.strip() for part in name.split("\n") if part.strip())
    return names


def _fetch_other_allergy(db: Session, user_id: uuid.UUID) -> str | None:
    rows = db.execute(
        select(AllergyType.allergen_name)
        .join(
            user_allergies,
            user_allergies.c.allergy_type_id == AllergyType.allergy_type_id,
        )
        .where(user_allergies.c.user_id == user_id)
    ).all()
    names = _custom_names(rows)
    return "\n".join(names) if names else None


def _fetch_health_conditions(db: Session, user_id: uuid.UUID) -> list[str]:
    rows = db.execute(
        select(HealthConditionType.condition_name)
        .join(
            user_health_conditions,
            user_health_conditions.c.condition_type_id
            == HealthConditionType.condition_type_id,
        )
        .where(user_health_conditions.c.user_id == user_id)
    ).all()
    return [
        r.condition_name
        for r in rows
        if r.condition_name
        and r.condition_name != OTHER_CONDITION_KEY
        and r.condition_name != "none"
        and not str(r.condition_name).startswith("other:")
    ]


def _fetch_other_condition(db: Session, user_id: uuid.UUID) -> str | None:
    rows = db.execute(
        select(HealthConditionType.condition_name)
        .join(
            user_health_conditions,
            user_health_conditions.c.condition_type_id
            == HealthConditionType.condition_type_id,
        )
        .where(user_health_conditions.c.user_id == user_id)
    ).all()
    names = _custom_names(rows)
    return "\n".join(names) if names else None


def _profile_response(db: Session, user: User) -> UserProfileResponse:
    user_id = user.user_id
    return UserProfileResponse(
        user_id=user_id,
        full_name=user.full_name or "",
        email=user.email or "",
        allergies=_fetch_allergies(db, user_id),
        health_conditions=_fetch_health_conditions(db, user_id),
        other_allergy=_fetch_other_allergy(db, user_id),
        other_condition=_fetch_other_condition(db, user_id),
    )


@router.get("/users/me", response_model=UserProfileResponse)
async def get_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _seed_canonical_types(db)
    user = _ensure_user(db, current_user)
    _ensure_health_profile(db, user.user_id)
    db.commit()
    return _profile_response(db, user)


@router.put("/users/me", response_model=UserProfileResponse)
async def update_profile(
    request: UserProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if (
        request.full_name is None
        and request.allergies is None
        and request.health_conditions is None
        and request.other_allergy is None
        and request.other_condition is None
    ):
        raise HTTPException(
            status_code=422,
            detail="Request body must include at least one field to update",
        )

    if request.full_name is not None and request.full_name.strip() == "":
        raise HTTPException(status_code=422, detail="full_name cannot be empty")

    _seed_canonical_types(db)
    user = _ensure_user(db, current_user)
    _ensure_health_profile(db, user.user_id)

    if request.full_name is not None:
        user.full_name = request.full_name.strip()[:120]

    if request.allergies is not None or request.other_allergy is not None:
        db.execute(delete(user_allergies).where(user_allergies.c.user_id == user.user_id))
        rows: list[dict] = []
        for item in request.allergies or []:
            name = (item.allergen_name or "").strip().lower().replace(" ", "_")
            if not name or name in {"other", "none", OTHER_ALLERGY_KEY}:
                continue
            allergy_type_id = _ensure_allergen_type(db, name[:50])
            rows.append(
                {
                    "user_id": user.user_id,
                    "allergy_type_id": allergy_type_id,
                    "severity": (item.severity or "moderate")[:20],
                }
            )
        other_names = [
            part.strip()
            for part in (request.other_allergy or "").split("\n")
            if part.strip()
        ]
        for other in other_names:
            other_type_id = _ensure_allergen_type(db, f"other:{other}"[:50])
            rows.append(
                {
                    "user_id": user.user_id,
                    "allergy_type_id": other_type_id,
                    "severity": "custom",
                }
            )
        if rows:
            db.execute(insert(user_allergies), rows)

    if request.health_conditions is not None or request.other_condition is not None:
        db.execute(
            delete(user_health_conditions).where(
                user_health_conditions.c.user_id == user.user_id
            )
        )
        rows = []
        for raw in request.health_conditions or []:
            name = (raw or "").strip().lower()
            if not name or name in {"none", "other"}:
                continue
            if name.startswith("other:"):
                continue
            condition_type_id = _ensure_condition_type(db, name[:100])
            rows.append(
                {
                    "user_id": user.user_id,
                    "condition_type_id": condition_type_id,
                }
            )
        other_names = [
            part.strip()
            for part in (request.other_condition or "").split("\n")
            if part.strip()
        ]
        for other in other_names:
            condition_type_id = _ensure_condition_type(db, f"other:{other}"[:100])
            rows.append(
                {
                    "user_id": user.user_id,
                    "condition_type_id": condition_type_id,
                }
            )
        if rows:
            db.execute(insert(user_health_conditions), rows)

    db.commit()
    db.refresh(user)
    return _profile_response(db, user)
