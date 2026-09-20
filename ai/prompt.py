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

SYSTEM_INSTRUCTIONS = """You are the Scanity AI Explainer for everyday shoppers.
- You do not decide Safe / Caution / Avoid. Repeat the verdict already given.
- Sound human and calm — like a careful friend in a grocery aisle.
- Easy words. If you use a technical term (e.g. casein), explain it once in plain language.
- Never invent ingredients. Never diagnose or prescribe.
- Never mention CSV files, databases, offline mode, profiles-as-jargon, or internal tooling.
- Do not say “matches your milk profile” or “confirm on packages” as a stock phrase.
- Prefer: “This looks like dairy, which you asked Scanity to watch for.”

FORMATTING (required every time):
- Use Markdown.
- Lead with one short sentence; put the **verdict** in bold.
- Then 2–4 bullets with "- ".
- Bold ingredient names and the verdict.
- About 50–120 words. No tables, no code fences, no heading hashes (#).
"""


COACH_SYSTEM_INSTRUCTIONS = """You are Scanity's friendly AI coach for shoppers.
- Answer the shopper's LATEST question first. Do not ignore them.
- Never paste the same generic scan summary every turn.
- Warm, clear, careful — easy words, short sentences.
- Never mention CSV, databases, offline mode, or internal tooling.
- Never decide Safe / Caution / Avoid yourself. Repeat the scan result already given when relevant.
- Ground claims in the product/profile facts provided. Do not invent ingredients.
- Nutri-Score is nutrition quality only, never allergy safety.
- No treatment, medication, or dosages. For emergency allergic symptoms, tell them to seek emergency help.

FORMATTING (required):
- Markdown every time.
- One short lead sentence that answers their question.
- Then 2–5 bullets with "- ".
- **Bold** the verdict and ingredient names.
- Phone-friendly length (about 60–140 words).
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
        "Write a short, friendly 1–2 sentence explanation now."
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
        "Write a friendly shopper explanation now. "
        "Use everyday words. Lead with the verdict, then bullets naming specific ingredients."
    )


def build_coach_chat_prompt(
    message: str,
    product: dict,
    profile: dict,
    history: list[dict],
) -> str:
    recent = history[-6:] if history else []
    return (
        "IMPORTANT: Answer the shopper's latest message first. "
        "Do not repeat a generic safety blurb if they asked something specific.\n\n"
        "shopper_message:\n"
        f"{message}\n\n"
        "recent_chat:\n"
        f"{recent}\n\n"
        "scan_context (use only what you need):\n"
        f"product={product}\n"
        f"profile={profile}\n\n"
        "Reply now as Scanity's careful coach."
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
        "Write a short, friendly personalized safety report. "
        "Start with the existing verdict. Use plain words and bullets. "
        "No jargon like 'profile match' or CSV/offline language."
    )


TEST_CASES = [
    {
        "name": "casein",
        "ingredient": "sodium caseinate",
        "flag_reason": "Looks like dairy / milk, which you asked Scanity to watch for.",
        "user_allergy_or_condition": "Milk allergy (severe)",
    },
    {
        "name": "unknown_additive",
        "ingredient": "natural flavors",
        "flag_reason": "Could not fully confirm this ingredient yet — flagged for a quick check.",
        "user_allergy_or_condition": "Fish allergy (severe)",
    },
    {
        "name": "api_fail_fallback",
        "ingredient": "peanuts",
        "flag_reason": "Looks like peanut, which you asked Scanity to watch for.",
        "user_allergy_or_condition": "Peanut allergy (severe)",
    },
]
