"""Turn noisy package OCR into a short product name for Open Food Facts."""

from __future__ import annotations

import re

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai

_NOISE = re.compile(
    r"^(ingredients?|ingredientes?|nutrition|nutritional|contains|allergen|allergens|"
    r"serving|calories|energy|protein|total|saturated|carbohydrate|sugars?|sodium|"
    r"fat|dietary|best before|www\.|http|imported|manufactured|net wt|net weight|"
    r"per 100|may contain|storage|keep|distributed)",
    re.IGNORECASE,
)

_TITLE_INSTRUCTIONS = """You clean text read from a food package photo.
Return only the product name a shopper would type into a search box.
Rules:
- One line. No ingredients, nutrition facts, addresses, weights, or barcodes.
- No markdown, no asterisks, no quotes, no explanation.
- Keep the brand and the product name when both are visible, such as "Bravo Biscuits".
- If the photo is mostly ingredients, pick the product name if it appears, otherwise return the shortest recognizable food name.
"""


def heuristic_product_title(text: str) -> str:
    lines = []
    for raw in str(text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip(" .-–—|")
        if len(line) < 3 or len(line) > 60:
            continue
        if _NOISE.match(line):
            continue
        if re.fullmatch(r"[\d\s./%-]+", line):
            continue
        letters = re.sub(r"[^A-Za-z]", "", line)
        if len(letters) < 3:
            continue
        lines.append(line)
    if not lines:
        return ""
    # The product name is usually near the top and shorter than an ingredient line.
    ranked = sorted(lines[:6], key=lambda line: (len(line.split()), len(line)))
    return ranked[0][:80]


def clean_product_title(text: str) -> tuple[str, str]:
    """Return (title, source). Source is gemini or heuristic."""
    fallback = heuristic_product_title(text)
    sample = str(text or "").strip()
    if len(sample) < 3:
        return fallback, "heuristic"

    ai_text = call_hosted_ai(
        "Package text:\n" + sample[:2500] + "\n\nProduct name only:",
        system_instructions=_TITLE_INSTRUCTIONS,
        max_output_tokens=32,
        temperature=0.1,
        timeout_seconds=8,
    )
    if not ai_text or ai_text == FALLBACK_TEXT:
        return fallback, "heuristic"

    title = ai_text.strip().strip("\"'`")
    title = title.splitlines()[0].strip()
    title = re.sub(r"\*+", "", title).strip(" .-")
    if len(re.sub(r"[^A-Za-z]", "", title)) < 3 or len(title) > 80:
        return fallback, "heuristic"
    if _NOISE.match(title):
        return fallback, "heuristic"
    return title, "gemini"
