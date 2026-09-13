"""
Run the three required #168 cases once a real GEMINI_API_KEY is available.

Usage (from the repository root):
    python -m ai.run_test_cases
"""

from __future__ import annotations

import os

from ai.gemini_client import FALLBACK_TEXT, _gemini_settings, call_hosted_ai
from ai.prompt import TEST_CASES, build_prompt


def main() -> None:
    api_key, model = _gemini_settings()
    print(f"Model: {model}")
    print(f"API key loaded: {'yes' if api_key else 'no'}")

    for case in TEST_CASES:
        print(f"\n=== {case['name']} ===")
        prompt = build_prompt(
            case["ingredient"],
            case["flag_reason"],
            case["user_allergy_or_condition"],
        )

        if case["name"] == "api_fail_fallback":
            previous = os.environ.get("GEMINI_API_KEY")
            os.environ["GEMINI_API_KEY"] = ""
            try:
                result = call_hosted_ai(prompt)
            finally:
                if previous is None:
                    os.environ.pop("GEMINI_API_KEY", None)
                else:
                    os.environ["GEMINI_API_KEY"] = previous
            if result != FALLBACK_TEXT:
                raise SystemExit(f"FAILED api_fail_fallback: expected fallback, got {result!r}")
        else:
            result = call_hosted_ai(prompt)
            if not result or result == FALLBACK_TEXT:
                raise SystemExit(
                    f"FAILED {case['name']}: expected live text, got {result!r}"
                )

        print(f"Result: {result}")

    print("\nAll required cases passed.")


if __name__ == "__main__":
    main()
