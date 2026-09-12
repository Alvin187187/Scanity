"""
Structural test of gemini_client.call_hosted_ai using mocks - the real API
domain isn't reachable from this sandbox, so this verifies the error-handling
logic itself rather than a live call. Run this, then re-verify with a real
key on your machine before merging.
"""
import os
os.environ["GEMINI_API_KEY"] = "fake-key-for-testing"

from unittest.mock import patch, MagicMock
import requests
import gemini_client
from gemini_client import call_hosted_ai, FALLBACK_TEXT


def make_response(status_code, json_data=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


print("Test 1: successful response")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.return_value = make_response(200, {
        "candidates": [{"content": {"parts": [{"text": "Avoid. This contains casein, a milk protein."}]}}]
    })
    result = call_hosted_ai("test prompt")
    assert result == "Avoid. This contains casein, a milk protein.", f"FAILED: got {result!r}"
    print("  PASS:", result)

print("\nTest 2: 401 unauthorized")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.return_value = make_response(401)
    result = call_hosted_ai("test prompt")
    assert result == FALLBACK_TEXT, f"FAILED: got {result!r}"
    print("  PASS: fallback returned")

print("\nTest 3: 429 rate limited")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.return_value = make_response(429)
    result = call_hosted_ai("test prompt")
    assert result == FALLBACK_TEXT, f"FAILED: got {result!r}"
    print("  PASS: fallback returned")

print("\nTest 4: 500 server error")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.return_value = make_response(500)
    result = call_hosted_ai("test prompt")
    assert result == FALLBACK_TEXT, f"FAILED: got {result!r}"
    print("  PASS: fallback returned")

print("\nTest 5: network timeout")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.side_effect = requests.exceptions.Timeout()
    result = call_hosted_ai("test prompt")
    assert result == FALLBACK_TEXT, f"FAILED: got {result!r}"
    print("  PASS: fallback returned, no crash")

print("\nTest 6: connection error (no network)")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.side_effect = requests.exceptions.ConnectionError()
    result = call_hosted_ai("test prompt")
    assert result == FALLBACK_TEXT, f"FAILED: got {result!r}"
    print("  PASS: fallback returned, no crash")

print("\nTest 7: malformed response body")
with patch("gemini_client.requests.post") as mock_post:
    mock_post.return_value = make_response(200, {"unexpected": "shape"})
    result = call_hosted_ai("test prompt")
    assert result == FALLBACK_TEXT, f"FAILED: got {result!r}"
    print("  PASS: fallback returned, no crash")

print("\nTest 8: missing API key")
os.environ["GEMINI_API_KEY"] = ""
import importlib
importlib.reload(gemini_client)
result = gemini_client.call_hosted_ai("test prompt")
assert result == gemini_client.FALLBACK_TEXT, f"FAILED: got {result!r}"
print("  PASS: fallback returned, no crash")

print("\nAll 8 tests passed - wrapper never crashes, always returns a string.")