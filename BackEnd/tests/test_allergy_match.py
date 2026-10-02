"""
Unit/Integration tests for app/services/allergy_match_service.py
"""
import pytest
import uuid
from sqlalchemy import select, insert
from app.database.session import get_db
from app.models.schema import User, AllergyType, user_allergies
from app.services.allergy_match_service import match_allergies

USER_ID = "a1111111-1111-1111-1111-111111111111"

@pytest.fixture(autouse=True)
def seed_allergy_data():
    db = next(get_db())
    # Ensure test user exists
    if not db.get(User, uuid.UUID(USER_ID)):
        db.add(User(user_id=uuid.UUID(USER_ID), email="allergy_test@example.com", full_name="Allergy User"))
        db.commit()

    # Get existing allergy type or insert if missing
    allergy_type = db.execute(
        select(AllergyType).where(AllergyType.allergen_name == "milk")
    ).scalar_one_or_none()

    if not allergy_type:
        milk_id = uuid.uuid4()
        db.execute(insert(AllergyType).values(allergy_type_id=milk_id, allergen_name="milk"))
        db.commit()
        allergy_type_id = milk_id
    else:
        allergy_type_id = allergy_type.allergy_type_id

    # Attach allergy to test user if not already attached
    existing_link = db.execute(
        select(user_allergies).where(
            user_allergies.c.user_id == uuid.UUID(USER_ID),
            user_allergies.c.allergy_type_id == allergy_type_id
        )
    ).first()

    if not existing_link:
        db.execute(insert(user_allergies).values(user_id=uuid.UUID(USER_ID), allergy_type_id=allergy_type_id, severity="severe"))
        db.commit()

def test_match_allergies_detected():
    db = next(get_db())
    result = match_allergies(db, uuid.UUID(USER_ID), ["Whole Milk", "Sugar", "Water"])
    
    assert result["has_match"] is True
    assert "milk" in result["flagged"]
    assert result["severity_max"] == "severe"

def test_match_allergies_no_match():
    db = next(get_db())
    result = match_allergies(db, uuid.UUID(USER_ID), ["Apples", "Bananas"])
    
    assert result["has_match"] is False
    assert len(result["flagged"]) == 0

