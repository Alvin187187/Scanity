"""
ai/prompt.py

Builds the exact prompt sent to call_hosted_ai(). Matches the ticket's
input shape: ingredient + flag_reason + user_allergy_or_condition.
"""

SYSTEM_INSTRUCTIONS = """You are a food-safety assistant, not a doctor.
You will be given one flagged ingredient, the reason it was flagged, and the
user's relevant allergy or condition. Explain the flag in 1-2 short, plain
sentences a regular shopper can understand. Do not diagnose. Do not suggest
treatment, medication, or medical action. Do not tell the user to use their
own judgment, make their own decision, or exercise caution - simply state
the fact (e.g. that the ingredient could not be identified) and stop. Only
use the facts given to you - never invent an ingredient or health claim."""


def build_prompt(ingredient: str, flag_reason: str, user_allergy_or_condition: str) -> str:
    return (
        f"{SYSTEM_INSTRUCTIONS}\n\n"
        f"Ingredient: {ingredient}\n"
        f"Flag reason: {flag_reason}\n"
        f"User's allergy/condition: {user_allergy_or_condition}\n\n"
        f"Write the 1-2 sentence explanation now."
    )


TEST_CASES = [
    {
        "name": "casein",
        "ingredient": "sodium caseinate",
        "flag_reason": "Matches Milk allergen category (Avoid)",
        "user_allergy_or_condition": "Milk allergy (severe)",
    },
    {
        "name": "unknown_additive",
        "ingredient": "natural flavors",
        "flag_reason": "Unresolved - could not be matched to a known allergen (Caution)",
        "user_allergy_or_condition": "Fish allergy (severe)",
    },
    {
        "name": "api_fail_fallback",
        "ingredient": "peanuts",
        "flag_reason": "Matches Peanut allergen category (Avoid)",
        "user_allergy_or_condition": "Peanut allergy (severe)",
    },
]
