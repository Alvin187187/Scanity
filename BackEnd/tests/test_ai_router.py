from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.routers.ai_router import router


app = FastAPI()
app.include_router(router, prefix="/api/v1")
app.dependency_overrides[get_current_user] = lambda: {"id": "test-user"}
client = TestClient(app)


def test_ai_chat_returns_reply(monkeypatch):
    monkeypatch.setattr(
        "app.routers.ai_router.answer_product_question",
        lambda **kwargs: "Caution. Milk powder matched your milk allergy profile.",
    )
    response = client.post(
        "/api/v1/scan/ai/chat",
        json={
            "message": "Why is this caution?",
            "product": {"product_name": "Cookie", "verdict": "caution"},
            "profile": {"allergies": ["milk"], "conditions": []},
        },
    )
    assert response.status_code == 200
    assert "Caution" in response.json()["reply"]


def test_ai_safety_report_returns_report(monkeypatch):
    monkeypatch.setattr(
        "app.routers.ai_router.build_safety_report",
        lambda **kwargs: "Avoid. Peanut oil matches your peanut allergy.",
    )
    response = client.post(
        "/api/v1/scan/ai/safety-report",
        json={
            "product": {"product_name": "Snack", "verdict": "avoid", "safety_score": 18},
            "profile": {"allergies": ["peanut"], "conditions": ["asthma"]},
        },
    )
    assert response.status_code == 200
    assert "Avoid" in response.json()["report"]
