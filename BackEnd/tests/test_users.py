"""Proof tests for GET/PUT /users/me health profile persistence."""

from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.session import Base, engine, get_db
from app.dependencies.auth import get_current_user
from app.models.schema import User
from app.routers.users import router

USER_A_ID = "602402db-eed6-4c4b-9b4e-43f8aa759152"
USER_B_ID = "9f8e7d6c-5b4a-3928-1706-554433221100"

app = FastAPI()
app.include_router(router, prefix="/api/v1")
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    for user_id, email, name in (
        (USER_A_ID, "usera@example.com", "User A"),
        (USER_B_ID, "userb@example.com", "User B"),
    ):
        if db.get(User, uuid.UUID(user_id)) is None:
            db.add(User(user_id=uuid.UUID(user_id), email=email, full_name=name))
    db.commit()
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


def mock_user_a():
    return {"user_id": USER_A_ID, "email": "usera@example.com"}


def mock_user_b():
    return {"user_id": USER_B_ID, "email": "userb@example.com"}


def test_get_profile_unauthenticated():
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401


def test_update_and_get_profile_persists():
    app.dependency_overrides[get_current_user] = mock_user_a

    put_res = client.put(
        "/api/v1/users/me",
        json={
            "full_name": "Alvin Test",
            "allergies": [
                {"allergen_name": "milk", "severity": "high"},
                {"allergen_name": "peanut", "severity": "severe"},
            ],
            "health_conditions": ["diabetes"],
            "other_allergy": "kiwi",
            "other_condition": "anemia",
        },
    )
    assert put_res.status_code == 200, put_res.text
    data = put_res.json()
    assert data["full_name"] == "Alvin Test"
    names = {item["allergen_name"] for item in data["allergies"]}
    assert "milk" in names
    assert "peanut" in names
    assert "diabetes" in data["health_conditions"]
    assert data["other_allergy"] == "kiwi"
    assert data["other_condition"] == "anemia"

    get_res = client.get("/api/v1/users/me")
    assert get_res.status_code == 200, get_res.text
    again = get_res.json()
    assert {item["allergen_name"] for item in again["allergies"]} == names
    assert again["health_conditions"] == ["diabetes"]
    assert again["other_allergy"] == "kiwi"
    assert again["other_condition"] == "anemia"


def test_cross_user_isolation():
    app.dependency_overrides[get_current_user] = mock_user_a
    put_a = client.put(
        "/api/v1/users/me",
        json={"allergies": [{"allergen_name": "milk"}], "health_conditions": ["diabetes"]},
    )
    assert put_a.status_code == 200, put_a.text

    app.dependency_overrides[get_current_user] = mock_user_b
    put_b = client.put(
        "/api/v1/users/me",
        json={"allergies": [], "health_conditions": []},
    )
    assert put_b.status_code == 200, put_b.text
    body = put_b.json()
    assert body["allergies"] == []
    assert body["health_conditions"] == []
    assert body["user_id"] == USER_B_ID
