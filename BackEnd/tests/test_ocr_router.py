from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.ocr_router import router


app = FastAPI()

# Temporary test registration only.
# Production main.py is intentionally not modified yet.
app.include_router(router, prefix="/api")

client = TestClient(app)


def test_confirmed_ingredients_endpoint():
    response = client.post(
        "/api/scan/ocr",
        json={
            "confirmed_ingredients": [
                " Sugar ",
                "Milk",
                " Salt ",
            ]
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["parsed_ingredients"] == [
        "Sugar",
        "Milk",
        "Salt",
    ]

    assert data["allergy_flags"] == []
    assert data["score"] is None


def test_edited_ingredients_replace_confirmed_list():
    response = client.post(
        "/api/scan/ocr",
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
        "/api/scan/ocr",
        json={},
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "No usable ingredients were found."
    )