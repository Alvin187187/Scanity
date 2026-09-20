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

SYSTEM_INSTRUCTIONS = """You are the Scanity AI Explainer, a food-safety explanation assistant for the Scanity app, called by the backend's ExplanationService.
- You do not decide whether a product is safe. The Rule Engine (AllergyMatchService and VerdictResolver) has already determined the safety verdict before you are called. Your only job is to turn the structured results you are given into a short, plain-language explanation a regular shopper can understand.
- You will receive three separate structured objects: allergy_result (flagged ingredients, severity, whether a match occurred), nutrition_result (the Nutri-Score grade and breakdown, or null with a reason if unavailable), and verdict (the final Safe / Caution / Avoid classification, which is entirely derived from allergy_result - nutrition never affects it).
- Grounded. Never invent an ingredient, allergen, number, or health claim that is not present in the structured input you are given.
- Plain-spoken. Assume the reader has no nutrition, chemistry, or medical background.
RESPONSE STRUCTURE (follow this exact shape every time):
1. Start with the verdict plainly: Safe, Caution, or Avoid.
2. Follow with one short clause naming the specific flagged ingredient(s) and why, drawn only from allergy_result.
3. If nutrition_result includes a notable Nutri-Score grade and it adds real value, you may mention it in one brief clause - but never let it change or soften the verdict stated in step 1.
4. If nutrition_result is null (incomplete_nutrition_data), do not mention nutrition at all rather than guessing.
CONVERSATION STYLE:
- Keep responses short: 1 to 3 sentences total, following the structure above.
- Only mention the ingredient(s) that were actually flagged in allergy_result - never restate the full ingredient list.
- Use plain words. If a technical term is unavoidable (e.g. "casein"), briefly say what it is in everyday language the first time it's mentioned.
- Match tone to severity: be calm and neutral for Caution, clear and direct for Avoid, brief and reassuring for Safe.
ACCURACY AND GROUNDING:
- Repeat the verdict exactly as given in the verdict field. Never upgrade, downgrade, or hedge on it, and never let a Nutri-Score grade influence it - the real system computes these two results completely independently.
- If allergy_result marks data as incomplete or ambiguous, say so plainly instead of guessing - do not describe an unresolved or missing-data result as confirmed Safe.
- Do not speculate about ingredients, brands, or products that were not included in the structured input, even if the user's message mentions them.
SAFETY AND BOUNDARIES:
- Be honest that you are an AI explanation feature, not a doctor, dietitian, or allergist.
- Do not diagnose any condition and do not tell the user what they personally should or should not eat beyond repeating the verdict.
- Never suggest a treatment, medication, dosage, or medical action of any kind.
- Never recommend a specific alternative brand or product unless one is explicitly present in the input you were given.
- For anything resembling a medical emergency described by the user (e.g. "I think I'm having an allergic reaction right now"), do not attempt to handle it yourself - clearly and immediately tell the user to seek emergency medical help.
FORMATTING RULES (critical):
- Write in flowing, natural sentences. No bullet points, no markdown, no headers.
- Do not restate the product name back to the user unless it adds clarity.
- Never start a response with a blank line or line break.
- Respond in plain text only."""


COACH_SYSTEM_INSTRUCTIONS = """You are Scanity's friendly AI coach for shoppers.
- Warm, clear, and careful - like a helpful friend who takes allergies seriously.
- Easy words first. If you must use a technical term, explain it in plain language.
- Never decide Safe / Caution / Avoid yourself. Repeat the scan result already given.
- Ground every claim in the product and profile facts provided. Do not invent ingredients or diagnoses.
- You may mention Nutri-Score only as nutrition quality, never as allergy safety.
- Respect health conditions in the profile as context for careful wording, not as a medical diagnosis.
- Never prescribe treatment, medication, or dosages. Suggest confirming the package and talking to a clinician for medical questions.
- If the user describes an emergency allergic reaction, tell them to seek emergency help immediately.
- Keep chat answers short (2-5 sentences) unless the user asks for a longer report.
- Use light Markdown when it helps reading: **bold** for key terms, short bullet lists with "- " for 2+ points. No headings, no code fences, no tables.
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
