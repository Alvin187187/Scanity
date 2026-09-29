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

_DESCRIPTION = re.compile(
    r"\b(made with|baked with|perfect for|serving suggestion|delicious|recipe|"
    r"contains|rich in|source of|for your family|no artificial)\b",
    re.IGNORECASE,
)

_PHOTO_INSTRUCTIONS = """You read a food package photo and return only the product name.
Rules:
- One line. Brand plus product name when both are visible.
- No ingredients, nutrition facts, slogans, weights, addresses, or barcodes.
- No markdown, quotes, or explanation.
- Copy the printed name. Do not invent a different product.
- If you cannot read a product name, reply with the single word UNKNOWN.
"""

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


def title_from_package_photo(image_bytes: bytes, mime: str = "image/jpeg") -> str:
    """Read the product name from a package photo with hosted Gemini."""
    import base64

    if not image_bytes:
        return ""
    payload = base64.b64encode(image_bytes).decode("ascii")
    ai_text = call_hosted_ai(
        "What product is printed on this package? Product name only:",
        system_instructions=_PHOTO_INSTRUCTIONS,
        max_output_tokens=96,
        temperature=0.0,
        timeout_seconds=18,
        image_b64=payload,
        image_mime=mime if mime in {"image/jpeg", "image/png", "image/webp"} else "image/jpeg",
    )
    if not ai_text or ai_text == FALLBACK_TEXT:
        return ""
    title = ai_text.strip().strip("\"'`")
    title = title.splitlines()[0].strip()
    title = re.sub(r"\*+", "", title).strip(" .-")
    if title.upper() in {"UNKNOWN", "NONE", "N/A"}:
        return ""
    if len(re.sub(r"[^A-Za-z]", "", title)) < 3 or len(title) > 80:
        return ""
    if _NOISE.match(title) or _looks_like_description(title):
        return ""
    if len(title.split()) > 8:
        return ""
    return title


def _looks_like_description(line: str) -> bool:
    """Marketing sentences and ingredient dumps are not the product name."""
    if "," in line or _DESCRIPTION.search(line):
        return True
    return len(line.split()) > 7


def heuristic_product_title(text: str) -> str:
    lines = []
    for raw in str(text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip(" .-–—|")
        if len(line) < 3 or len(line) > 60:
            continue
        if _NOISE.match(line) or _looks_like_description(line):
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
    if _NOISE.match(title) or _looks_like_description(title):
        return fallback, "heuristic"
    if len(title.split()) > 8:
        return fallback, "heuristic"
    if not _title_agrees(title, sample):
        return fallback, "heuristic"
    return title, "gemini"


def title_supported_by_text(title: str, source: str) -> bool:
    """A proposed product name must still use the words read from the photo."""
    return _title_agrees(title, source)


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
        return any(_tokens_close(token, word) for word in haystack)

    return sum(1 for token in required if hit(token)) / len(required) >= 0.67


def _tokens_close(left: str, right: str) -> bool:
    if left == right:
        return True
    if len(left) > 3 and (left in right or right in left):
        return True
    if min(len(left), len(right)) < 5 or abs(len(left) - len(right)) > 1:
        return False
    mismatches = 0
    for index in range(max(len(left), len(right))):
        left_char = left[index] if index < len(left) else ""
        right_char = right[index] if index < len(right) else ""
        if left_char != right_char:
            mismatches += 1
            if mismatches > 1:
                return False
    return mismatches == 1
