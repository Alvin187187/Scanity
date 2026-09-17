from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.routers.ocr_router import router


def fake_current_user():
    return {
        "user_id": "test-user",
        "email": "test@example.com",
        "access_token": "test-token",
    }


app = FastAPI()
app.include_router(router, prefix="/api/v1")
app.dependency_overrides[get_current_user] = fake_current_user

client = TestClient(app)


unauthenticated_app = FastAPI()
unauthenticated_app.include_router(router, prefix="/api/v1")

unauthenticated_client = TestClient(unauthenticated_app)


def test_confirmed_ingredients_endpoint():
    response = client.post(
        "/api/v1/scan/ocr",
        json={
            "confirmed_ingredients": [
                " Sugar ",
                "Milk",
                " Salt ",
            ],
            "user_allergies": ["milk"],
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["parsed_ingredients"] == [
        "Sugar",
        "Milk",
        "Salt",
    ]
    assert data["verdict"] == "avoid"
    assert data["allergy_flags"] == ["Milk"]
    assert data["explanation"]


def test_edited_ingredients_replace_confirmed_list():
    response = client.post(
        "/api/v1/scan/ocr",
        json={
            "confirmed_ingredients": [
                "Sugar",
                "Mik",
                "Salt",
            ],
            "edited_ingredients": [
                "Sugar",
                "Milk",
                "Salt",
            ],
            "user_allergies": [],
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["parsed_ingredients"] == [
        "Sugar",
        "Milk",
        "Salt",
    ]


def test_blank_request_returns_clear_error():
    response = client.post(
        "/api/v1/scan/ocr",
        json={},
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "No usable ingredients were found."
    )


def test_missing_token_fails():
    response = unauthenticated_client.post(
        "/api/v1/scan/ocr",
        json={
            "confirmed_ingredients": [
                "Sugar",
                "Milk",
                "Salt",
            ]
        },
    )

    assert response.status_code == 401


def test_image_upload_uses_rapidocr(monkeypatch):
    monkeypatch.setattr(
        "app.routers.ocr_router.extract_text_from_image",
        lambda image_bytes, content_type=None: "Ingredients: sugar, milk, salt",
    )

    response = client.post(
        "/api/v1/scan/ocr/image",
        files={"file": ("label.jpg", b"fake-image-bytes", "image/jpeg")},
        data={"user_allergies": "milk"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "milk" in data["extracted_text"].lower()
    assert data["verdict"] == "avoid"


def test_image_upload_returns_text_even_without_ingredients(monkeypatch):
    monkeypatch.setattr(
        "app.routers.ocr_router.extract_text_from_image",
        lambda image_bytes, content_type=None: "Nutrition Facts\nCalories 250",
    )

    response = client.post(
        "/api/v1/scan/ocr/image",
        files={"file": ("label.jpg", b"fake-image-bytes", "image/jpeg")},
        data={"user_allergies": ""},
    )

    assert response.status_code == 200
    data = response.json()
    assert "Calories" in data["extracted_text"]
    assert data["parsed_ingredients"] == []
    assert data["verdict"] is None
