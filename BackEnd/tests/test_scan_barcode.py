from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.routers.scan_router as scan_router_module
from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.routers.scan_router import router
from app.services.barcode_lookup_service import ProductNotFoundError


def fake_current_user():
    return {
        "user_id": "test-user",
        "email": "test@example.com",
        "access_token": "test-token",
    }


def fake_db():
    yield object()


app = FastAPI()
app.include_router(router, prefix="/api/v1")
app.dependency_overrides[get_current_user] = fake_current_user
app.dependency_overrides[get_db] = fake_db

client = TestClient(app)


unauthenticated_app = FastAPI()
unauthenticated_app.include_router(router, prefix="/api/v1")
unauthenticated_app.dependency_overrides[get_db] = fake_db

unauthenticated_client = TestClient(unauthenticated_app)


def test_found_barcode_returns_product_with_analysis(monkeypatch):
    async def fake_get_product_by_barcode(db, barcode):
        return {
            "product_id": "11111111-1111-1111-1111-111111111111",
            "barcode": barcode,
            "product_name": "Test Product",
            "brand": "Test Brand",
            "category": "Test Category",
            "ingredients": [
                {
                    "name": "Sugar",
                    "is_allergen": False,
                }
            ],
        }

    monkeypatch.setattr(
        scan_router_module,
        "get_product_by_barcode",
        fake_get_product_by_barcode,
    )

    response = client.post(
        "/api/v1/scan/barcode",
        json={"barcode": "4800016640038"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["product"]["barcode"] == "4800016640038"
    assert data["product"]["product_name"] == "Test Product"
    assert data["verdict"] in {"safe", "caution", "avoid"}
    assert data["explanation"]
    assert isinstance(data["allergy_flags"], list)
    assert isinstance(data["allergy_matches"], list)


def test_unknown_barcode_returns_not_found(monkeypatch):
    async def fake_get_product_by_barcode(db, barcode):
        raise ProductNotFoundError(barcode)

    monkeypatch.setattr(
        scan_router_module,
        "get_product_by_barcode",
        fake_get_product_by_barcode,
    )

    response = client.post(
        "/api/v1/scan/barcode",
        json={"barcode": "0000000000000"},
    )

    assert response.status_code == 404

    assert response.json()["detail"] == {
        "error": "Product not found",
        "suggest_ocr": True,
    }


def test_missing_token_fails_before_barcode_lookup(monkeypatch):
    service_called = {"value": False}

    async def fake_get_product_by_barcode(db, barcode):
        service_called["value"] = True
        return {
            "product_id": "11111111-1111-1111-1111-111111111111",
            "barcode": barcode,
            "product_name": "Should Not Be Returned",
            "brand": None,
            "category": None,
            "ingredients": [],
        }

    monkeypatch.setattr(
        scan_router_module,
        "get_product_by_barcode",
        fake_get_product_by_barcode,
    )

    response = unauthenticated_client.post(
        "/api/v1/scan/barcode",
        json={"barcode": "4800016640038"},
    )

    assert response.status_code == 401
    assert service_called["value"] is False