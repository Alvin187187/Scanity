"""
run_test_cases.py

Run this once you have a real GEMINI_API_KEY in your .env to confirm all 3
required test cases behave correctly end-to-end.

Usage:
    python run_test_cases.py
"""
import os
from prompt import build_prompt, TEST_CASES
from gemini_client import call_hosted_ai

for case in TEST_CASES:
    print(f"\n=== {case['name']} ===")
    prompt = build_prompt(case["ingredient"], case["flag_reason"], case["user_allergy_or_condition"])

    if case["name"] == "api_fail_fallback":
        # Force a failure to prove the fallback path works, per the ticket
        real_key = os.environ.get("GEMINI_API_KEY")
        os.environ["GEMINI_API_KEY"] = ""
        import importlib
        import gemini_client
        importlib.reload(gemini_client)
        result = gemini_client.call_hosted_ai(prompt)
        os.environ["GEMINI_API_KEY"] = real_key or ""
        importlib.reload(gemini_client)
    else:
        result = call_hosted_ai(prompt)

    print(f"Result: {result}")