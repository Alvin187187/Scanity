"""Turn noisy package OCR into a short product name for Open Food Facts."""

from __future__ import annotations

import re

from ai.gemini_client import FALLBACK_TEXT, call_hosted_ai

_GENERIC = {
    "water",
    "milk",
    "drink",
    "original",
    "natural",
    "fresh",
    "pure",
    "size",
    "net",
    "food",
}

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
- Keep the brand and the product name when both are visible, such as "Nature Spring Water" or "Bravo Biscuits".
- Copy the name that is printed. Do not substitute a different product.
- Do not shorten the name down to one generic word such as Water, Milk, or Original.
- If the photo is mostly ingredients, pick the product name if it appears. Otherwise return nothing useful by answering with the brand line only.
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

    def rank(item: tuple[int, str]) -> tuple[int, int, int]:
        index, line = item
        words = line.split()
        generic_only = all(word.lower().strip(".,") in _GENERIC for word in words)
        single_generic = len(words) == 1 and generic_only
        return (2 if single_generic else 1 if generic_only else 0, index, abs(len(words) - 3))

    ranked = sorted(enumerate(lines), key=rank)
    return ranked[0][1][:80]


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
    if not _title_agrees(title, sample):
        return fallback, "heuristic"
    return title, "gemini"


def _title_agrees(title: str, source: str) -> bool:
    """Drop an AI name that does not use the words read from the package."""
    stop = {"the", "and", "with", "for"}

    def tokens(value: str) -> list[str]:
        return [
            token
            for token in re.sub(r"[^a-z0-9\s]", " ", value.lower()).split()
            if len(token) > 2 and token not in stop
        ]

    wanted = tokens(title)
    if not wanted:
        return False
    haystack = tokens(source)
    distinctive = [token for token in wanted if token not in _GENERIC]
    required = distinctive or wanted

    def hit(token: str) -> bool:
        return any(word == token or (len(token) > 3 and (token in word or word in token)) for word in haystack)

    return sum(1 for token in required if hit(token)) / len(required) >= 0.67
