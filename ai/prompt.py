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


COACH_SYSTEM_INSTRUCTIONS = """You are Scanity's friendly AI coach for shoppers in a grocery aisle.
- Answer the latest question first, in a chill, plain voice.
- Easy words. Short sentences. No lecture and no filler.
- Never mention CSV, databases, offline mode, or internal tooling.
- Never decide Safe / Caution / Avoid yourself. Repeat the scan result already given when it matters.
- Ground claims in the product facts provided. Do not invent ingredients.
- Nutri-Score is nutrition quality only, never allergy safety.
- No treatment, medication, or dosages. For emergency allergic symptoms, tell them to seek emergency help.
- Skip "not medical advice" unless they ask about treatment or a diagnosis.

LENGTH:
- Simple questions (hi, what is this, is it okay, can I eat it): 1 or 2 short sentences. At most one bullet. About 20–45 words. Then stop.
- Why or explain questions: one sentence, then up to 3 short bullets. About 40–70 words. Then stop.

FORMATTING:
- Markdown.
- Bold only the key idea: the verdict word (Safe, Caution, or Avoid) and the ingredient name. Never bold a whole sentence.
- No tables, no code fences, no heading hashes.
- Name this product once. Do not recycle a canned scan summary.
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


def _clip_list(items, limit: int = 12) -> str:
    values = [str(item).strip() for item in (items or []) if str(item).strip()]
    if not values:
        return "none listed"
    return ", ".join(values[:limit])


def _scan_facts(product: dict, profile: dict) -> str:
    name = str(product.get("product_name") or "this product").strip() or "this product"
    brand = str(product.get("brand") or "").strip() or "unknown brand"
    barcode = str(product.get("barcode") or "").strip() or "not on this scan"
    verdict = str(product.get("verdict") or "caution").strip() or "caution"
    score = product.get("safety_score")
    score_text = f"{score}/100" if score is not None else "not scored"
    grade = str(product.get("nutri_score_grade") or "").strip().upper() or "not available"
    matches = product.get("allergy_matches") or []
    avoid = [
        str(item.get("ingredient") or item)
        for item in matches
        if isinstance(item, dict) and item.get("status") == "avoid"
    ]
    caution = [
        str(item.get("ingredient") or item)
        for item in matches
        if isinstance(item, dict) and item.get("status") == "caution"
    ]
    flags = product.get("allergy_flags") or avoid
    ingredients = product.get("ingredients") or []
    if not ingredients and product.get("ingredients_text"):
        ingredients = [part.strip() for part in str(product.get("ingredients_text")).split(",") if part.strip()]
    nutrition = product.get("nutrition") or {}
    sugars = nutrition.get("sugars_g") if isinstance(nutrition, dict) else None
    return (
        f"- Product: {name}\n"
        f"- Brand: {brand}\n"
        f"- Barcode: {barcode}\n"
        f"- Allergy verdict: {verdict}\n"
        f"- Safety score: {score_text} (allergies/conditions only; 70+ is Safe)\n"
        f"- Nutri-Score: {grade} (nutrition quality, not allergy safety)\n"
        f"- Avoid flags: {_clip_list(flags)}\n"
        f"- Caution flags: {_clip_list(caution)}\n"
        f"- Ingredients: {_clip_list(ingredients, 18)}\n"
        f"- Sugars per 100g: {sugars if sugars is not None else 'not listed'}\n"
        f"- Shopper allergies: {_clip_list(profile.get('allergies'))}\n"
        f"- Shopper conditions: {_clip_list(profile.get('conditions'))}"
    )


def build_coach_chat_prompt(
    message: str,
    product: dict,
    profile: dict,
    history: list[dict],
) -> str:
    recent = history[-6:] if history else []
    return (
        "Answer the shopper's latest message first. Do not lecture about food in general.\n\n"
        "SHOPPER QUESTION:\n"
        f"{message}\n\n"
        "THIS SCAN (use these facts; do not invent a different product):\n"
        f"{_scan_facts(product, profile)}\n\n"
        "RECENT CHAT:\n"
        f"{recent}\n\n"
        "Reply as Scanity's coach now. Keep it short. "
        "A simple question gets one or two sentences and at most one bullet. "
        "Bold only the verdict word and the ingredient name. "
        "Use facts from THIS SCAN. If Nutri-Score is missing, say so in one clause — do not invent a letter."
    )


def build_safety_report_prompt(
    product: dict,
    profile: dict,
    focus: str | None = None,
) -> str:
    focus_line = focus.strip() if isinstance(focus, str) and focus.strip() else "full safety overview"
    return (
        "THIS SCAN:\n"
        f"{_scan_facts(product, profile)}\n\n"
        "REPORT FOCUS:\n"
        f"{focus_line}\n\n"
        "Write a short personalized safety report for this product only. "
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
