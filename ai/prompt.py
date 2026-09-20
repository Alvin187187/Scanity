"""
Build the user prompt for call_hosted_ai().

Ticket: #168 / #154

Input shape:
    ingredient + flag_reason + user_allergy_or_condition

The system role is sent separately (see SYSTEM_INSTRUCTIONS) so the model
cannot treat shopper facts as instructions. The wrapper explains a flag
already decided by the allergy rule engine. It does not diagnose, treat,
or change the verdict.

Wording follows Scanity AI Explainer V3: short, factual, non-diagnostic,
plain language. Nutrition never changes the allergy verdict.
"""

SYSTEM_INSTRUCTIONS = """You are the Scanity AI Explainer for shoppers.
- You do not decide Safe / Caution / Avoid. Repeat the verdict already given by the rule engine.
- Ground every claim in allergy_result / nutrition_result. Never invent ingredients or diagnoses.
- Nutri-Score is nutrition quality only - never let it change the allergy verdict.
- Plain words. If you must use a technical term (e.g. casein), explain it once in everyday language.
- Not a doctor. No treatment, medication, or dosages. For emergency allergic symptoms, tell them to seek emergency help.
- If allergy_result is incomplete/ambiguous, say so - do not call it confirmed Safe.

FORMATTING (required every time):
- Use Markdown.
- Lead with one short sentence that states the **verdict** in bold.
- Then a bullet list with "- " for 2-4 concrete points naming the specific flagged ingredients and why.
- Optional final short line on Nutri-Score only if nutrition_result has a grade.
- About 60-140 words. No tables, no code fences, no heading hashes (#).
"""


COACH_SYSTEM_INSTRUCTIONS = """You are Scanity's friendly AI coach for shoppers.
- Never mention CSV files, databases, internal tooling, or implementation details to shoppers.
- Warm, clear, and careful - like a helpful friend who takes allergies seriously.
- Easy words first. If you must use a technical term, explain it in plain language.
- Never decide Safe / Caution / Avoid yourself. Repeat the scan result already given.
- Ground every claim in the product and profile facts provided. Do not invent ingredients or diagnoses.
- You may mention Nutri-Score only as nutrition quality, never as allergy safety.
- Respect health conditions in the profile as context for careful wording, not as a medical diagnosis.
- Never prescribe treatment, medication, or dosages. Suggest confirming the package and talking to a clinician for medical questions.
- If the user describes an emergency allergic reaction, tell them to seek emergency help immediately.

FORMATTING (required):
- Use Markdown every time.
- Start with one short lead sentence.
- Then use a bullet list with "- " for 2-5 concrete points.
- Use **bold** for the verdict and ingredient names.
- Keep total length readable on a phone (about 80-160 words).
- No tables, no code fences, no heading hashes.
"""


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


def build_explainer_prompt(
    allergy_result: dict,
    nutrition_result: dict | None,
    verdict: str,
) -> str:
    """Structured user turn for the Scanity AI Explainer V3 contract."""
    nutrition_payload = nutrition_result if nutrition_result else {
        "status": "incomplete_nutrition_data",
        "grade": None,
        "reason": "Nutrition data was not available for this product.",
    }
    return (
        "allergy_result:\n"
        f"{allergy_result}\n\n"
        "nutrition_result:\n"
        f"{nutrition_payload}\n\n"
        "verdict:\n"
        f"{verdict}\n\n"
        "Write the explanation now."
    )


def build_coach_chat_prompt(
    message: str,
    product: dict,
    profile: dict,
    history: list[dict],
) -> str:
    recent = history[-6:] if history else []
    return (
        "product:\n"
        f"{product}\n\n"
        "profile:\n"
        f"{profile}\n\n"
        "recent_chat:\n"
        f"{recent}\n\n"
        "shopper_message:\n"
        f"{message}\n\n"
        "Reply as Scanity's careful coach now."
    )


def build_safety_report_prompt(
    product: dict,
    profile: dict,
    focus: str | None = None,
) -> str:
    focus_line = focus.strip() if isinstance(focus, str) and focus.strip() else "full safety overview"
    return (
        "product:\n"
        f"{product}\n\n"
        "profile:\n"
        f"{profile}\n\n"
        "report_focus:\n"
        f"{focus_line}\n\n"
        "Write a short personalized safety report for this shopper now. "
        "Start with the existing verdict. Cover allergy fit, notable flagged ingredients, "
        "and how health conditions in the profile should make them extra careful - "
        "without diagnosing or changing the verdict."
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
