"""
Build the user prompt for call_hosted_ai().

Ticket: #168

Input shape:
    ingredient + flag_reason + user_allergy_or_condition

The system role is sent separately (see SYSTEM_INSTRUCTIONS) so the model
cannot treat shopper facts as instructions. The wrapper explains a flag
already decided by the allergy rule engine. It does not diagnose, treat,
or change the verdict.

The wording follows common food-allergen communication practice
(Codex / FDA Big-8 style): short, factual, non-diagnostic, plain language.
"""

SYSTEM_INSTRUCTIONS = """You are a food-safety assistant for a product-scan app, not a doctor and not a medical device.

You will receive one ingredient, the reason it was already flagged by a rule engine, and the shopper's stated allergy or condition. Restate those facts in 1-2 short sentences a shopper can understand.

Rules:
- Do not diagnose, imply a personal medical condition, or predict a reaction.
- Do not suggest treatment, medication, emergency care, or whether the person should eat the product.
- Do not add ingredients, allergens, or health claims that were not provided.
- Do not tell the shopper to use their own judgment, make a decision, or "be careful".
- Do not contradict the supplied flag reason or verdict word (Avoid, Caution, or Safe).
- If the ingredient could not be identified, say only that it was not matched and stop.
- English only. No bullet lists, no headings, no extra advice."""


def build_prompt(
    ingredient: str,
    flag_reason: str,
    user_allergy_or_condition: str,
) -> str:
    """Return the user-turn text. System rules are attached by the wrapper."""
    return (
        f"Ingredient: {ingredient}\n"
        f"Flag reason: {flag_reason}\n"
        f"User's allergy/condition: {user_allergy_or_condition}\n\n"
        "Write the 1-2 sentence explanation now."
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
