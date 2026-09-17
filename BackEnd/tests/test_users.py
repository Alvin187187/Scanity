"""
Proof tests for PR #145 Health Profile API.
Includes database user seeding fixture and strict response checks.
"""
import pytest
import uuid
from fastapi.testclient import TestClient

from main import app
from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.schema import User

client = TestClient(app)

USER_A_ID = "602402db-eed6-4c4b-9b4e-43f8aa759152"
USER_B_ID = "11111111-2222-3333-4444-555555555555"


def mock_get_current_user_a():
    return {"user_id": USER_A_ID, "email": "usera@example.com"}


def mock_get_current_user_b():
    return {"user_id": USER_B_ID, "email": "userb@example.com"}


@pytest.fixture(autouse=True)
def seed_test_users():
    """Seeds test users directly in the database before running tests."""
    db = next(get_db())
    
    user_a = db.get(User, uuid.UUID(USER_A_ID))
    if not user_a:
        db.add(User(user_id=uuid.UUID(USER_A_ID), email="usera@example.com", full_name="User A"))

    user_b = db.get(User, uuid.UUID(USER_B_ID))
    if not user_b:
        db.add(User(user_id=uuid.UUID(USER_B_ID), email="userb@example.com", full_name="User B"))

    db.commit()


def test_get_profile_unauthenticated():
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401


def test_update_and_get_profile_success():
    app.dependency_overrides[get_current_user] = mock_get_current_user_a

    put_payload = {
        "full_name": "Justine Test",
        "allergies": [
            {"allergen_name": "milk", "severity": "high"},
            {"allergen_name": "peanut", "severity": "severe"},
        ],
        "health_conditions": ["diabetes"],
    }

    put_res = client.put("/api/v1/users/me", json=put_payload)
    assert put_res.status_code == 200, f"Expected 200, got {put_res.status_code}: {put_res.text}"
    
    data = put_res.json()
    assert data["full_name"] == "Justine Test"
    assert len(data["allergies"]) == 2
    assert "diabetes" in data["health_conditions"]

    get_res = client.get("/api/v1/users/me")
    assert get_res.status_code == 200, f"Expected 200, got {get_res.status_code}: {get_res.text}"
    
    get_data = get_res.json()
    assert len(get_data["allergies"]) == 2
    assert get_data["health_conditions"] == ["diabetes"]

    app.dependency_overrides.clear()


def test_unknown_allergen_rejected():
    app.dependency_overrides[get_current_user] = mock_get_current_user_a

    invalid_payload = {
        "allergies": [{"allergen_name": "invalid_allergen_xyz", "severity": "low"}]
    }

    res = client.put("/api/v1/users/me", json=invalid_payload)
    assert res.status_code == 422, f"Expected 422, got {res.status_code}: {res.text}"
    assert "Unknown allergy category" in str(res.json())

    app.dependency_overrides.clear()


def test_empty_payload_rejected():
    app.dependency_overrides[get_current_user] = mock_get_current_user_a

    res_empty = client.put("/api/v1/users/me", json={})
    assert res_empty.status_code == 422, f"Expected 422, got {res_empty.status_code}: {res_empty.text}"

    res_name = client.put("/api/v1/users/me", json={"full_name": "   "})
    assert res_name.status_code == 422, f"Expected 422, got {res_name.status_code}: {res_name.text}"

    app.dependency_overrides.clear()


def test_cross_user_isolation():
    # User A updates profile
    app.dependency_overrides[get_current_user] = mock_get_current_user_a
    put_a = client.put(
        "/api/v1/users/me",
        json={"full_name": "User A", "allergies": [{"allergen_name": "milk"}]},
    )
    assert put_a.status_code == 200, f"User A PUT failed: {put_a.text}"

    # User B reads profile (must not see User A data)
    app.dependency_overrides[get_current_user] = mock_get_current_user_b
    user_b_res = client.get("/api/v1/users/me")
    assert user_b_res.status_code == 200, f"User B GET failed: {user_b_res.text}"
    
    b_data = user_b_res.json()
    assert b_data["full_name"] != "User A"
    assert len(b_data["allergies"]) == 0

    app.dependency_overrides.clear()

