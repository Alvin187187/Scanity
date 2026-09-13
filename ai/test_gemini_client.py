"""
Mocked tests for call_hosted_ai. No live key required.

Usage (from the repository root):
    python -m ai.test_gemini_client
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import requests

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai
from ai.prompt import SYSTEM_INSTRUCTIONS, TEST_CASES, build_prompt


def make_response(status_code: int, json_data: dict | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


def _ok_body(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def run() -> None:
    os.environ["GEMINI_API_KEY"] = "test-only-gemini-key"

    print("Test 1: successful response")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(
            200,
            _ok_body("Sodium caseinate is a milk protein, which matches the milk allergy on this profile."),
        )
        result = call_hosted_ai("test prompt")
        assert "milk protein" in result, f"FAILED: got {result!r}"
        payload = mock_post.call_args.kwargs["json"]
        assert payload["systemInstruction"]["parts"][0]["text"] == SYSTEM_INSTRUCTIONS
        assert payload["contents"][0]["parts"][0]["text"] == "test prompt"
        assert "x-goog-api-key" in mock_post.call_args.kwargs["headers"]
        print("  PASS:", result)

    print("\nTest 2: 401 unauthorized")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(401)
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned")

    print("\nTest 3: 429 rate limited")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(429)
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned")

    print("\nTest 4: 500 server error")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(500)
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned")

    print("\nTest 5: network timeout")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.side_effect = requests.exceptions.Timeout()
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned, no crash")

    print("\nTest 6: connection error (no network)")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.side_effect = requests.exceptions.ConnectionError()
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned, no crash")

    print("\nTest 7: malformed response body")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(200, {"unexpected": "shape"})
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned, no crash")

    print("\nTest 8: missing API key")
    previous = os.environ.get("GEMINI_API_KEY")
    os.environ["GEMINI_API_KEY"] = ""
    try:
        with patch("ai.gemini_client.requests.post") as mock_post:
            assert call_hosted_ai("test prompt") == FALLBACK_TEXT
            mock_post.assert_not_called()
        print("  PASS: fallback returned, no request sent")
    finally:
        if previous is None:
            os.environ.pop("GEMINI_API_KEY", None)
        else:
            os.environ["GEMINI_API_KEY"] = previous

    print("\nTest 9: key is read at call time (no module reload)")
    os.environ["GEMINI_API_KEY"] = "rotated-test-key"
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(200, _ok_body("ok"))
        assert call_hosted_ai("test prompt") == "ok"
        assert mock_post.call_args.kwargs["headers"]["x-goog-api-key"] == "rotated-test-key"
        print("  PASS: new key used without reload")

    print("\nTest 10: safety-blocked candidate")
    with patch("ai.gemini_client.requests.post") as mock_post:
        mock_post.return_value = make_response(
            200,
            {"candidates": [{"finishReason": "SAFETY", "content": {"parts": []}}]},
        )
        assert call_hosted_ai("test prompt") == FALLBACK_TEXT
        print("  PASS: fallback returned, no crash")

    print("\nTest 11: empty prompt")
    with patch("ai.gemini_client.requests.post") as mock_post:
        assert call_hosted_ai("   ") == FALLBACK_TEXT
        mock_post.assert_not_called()
        print("  PASS: fallback returned, no request sent")

    print("\nTest 12: required prompt cases exist")
    names = [case["name"] for case in TEST_CASES]
    assert names == ["casein", "unknown_additive", "api_fail_fallback"]
    sample = build_prompt("sodium caseinate", "Matches Milk (Avoid)", "Milk allergy")
    assert "sodium caseinate" in sample
    assert "not a doctor" in SYSTEM_INSTRUCTIONS
    print("  PASS: casein / unknown_additive / api_fail_fallback")

    print("\nAll wrapper tests passed.")


if __name__ == "__main__":
    run()
