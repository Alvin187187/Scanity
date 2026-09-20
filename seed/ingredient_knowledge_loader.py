"""Load curated ingredient knowledge for clickable chip explain panels.

Fast path: exact / E-number / token inverted-index lookup.
Contains-scan is limited to pre-sorted longer keys only after exact miss.
"""

from __future__ import annotations

import csv
import re
from functools import lru_cache
from pathlib import Path

SEED_FILE_PATH = Path(__file__).parent / "ingredient_knowledge.csv"

SKIP_CONTAINS = {
    "flavor",
    "flavour",
    "flavoring",
    "flavouring",
    "seasoning",
    "extract",
    "powder",
    "natural",
    "artificial",
    "organic",
    "blend",
    "base",
    "mix",
    "sauce",
    "oil",
    "acid",
    "color",
    "colour",
    "spice",
    "spices",
}


def _normalize(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _split_flags(raw: str | None) -> list[str]:
    return [part.strip() for part in str(raw or "").split("|") if part.strip()]


def shopper_source(raw: str | None) -> str:
    """Never expose CSV filenames or internal dataset labels to shoppers."""
    text = (raw or "").strip()
    if not text:
        return "Scanity ingredient guide"
    low = text.lower()
    if ".csv" in low or "allergies_10k" in low or "allergen_datasets" in low:
        return "Scanity allergen guide"
    if "openfoodfacts" in low or "open food facts" in low:
        return "Open Food Facts + Scanity allergen guide"
    if "curated" in low:
        return "Scanity curated allergen notes"
    if "ai/ml" in low or "generated" in low:
        return "Scanity food-safety reference"
    return text


@lru_cache(maxsize=1)
def load_ingredient_knowledge(csv_path: str | None = None) -> list[dict]:
    path = Path(csv_path) if csv_path else SEED_FILE_PATH
    rows: list[dict] = []
    if not path.is_file():
        return rows
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            name = (raw.get("ingredient_name") or "").strip()
            if not name:
                continue
            aliases = [
                part.strip()
                for part in str(raw.get("aliases") or "").split("|")
                if part.strip()
            ]
            rows.append(
                {
                    "ingredient_name": name,
                    "aliases": aliases,
                    "category": (raw.get("category") or "").strip(),
                    "what_it_is": (raw.get("what_it_is") or "").strip(),
                    "commonly_seen_in": (raw.get("commonly_seen_in") or "").strip(),
                    "possible_effects": (raw.get("possible_effects") or "").strip(),
                    "affects_allergens": _split_flags(raw.get("affects_allergens")),
                    "affects_diets": _split_flags(raw.get("affects_diets")),
                    "source": shopper_source(raw.get("source")),
                }
            )
    return rows


@lru_cache(maxsize=1)
def _search_structures() -> tuple[dict[str, dict], list[str], dict[str, list[str]]]:
    """exact index, pre-sorted contains keys, token -> keys inverted index."""
    index: dict[str, dict] = {}
    token_postings: dict[str, list[str]] = {}
    for row in load_ingredient_knowledge():
        keys = [row["ingredient_name"], *row.get("aliases", [])]
        for key in keys:
            norm = _normalize(key)
            if not norm or norm in index:
                continue
            index[norm] = row
            for token in norm.split():
                if len(token) < 3 or token in SKIP_CONTAINS:
                    continue
                token_postings.setdefault(token, []).append(norm)
    sorted_keys = sorted(
        (key for key in index if key not in SKIP_CONTAINS and len(key) >= 4),
        key=len,
        reverse=True,
    )
    return index, sorted_keys, token_postings


def lookup_ingredient_knowledge(ingredient: str) -> dict | None:
    """Return knowledge for an ingredient name or E-number, or None."""
    if not isinstance(ingredient, str) or not ingredient.strip():
        return None
    index, sorted_keys, token_postings = _search_structures()
    normalized = _normalize(ingredient)
    direct = index.get(normalized)
    if direct:
        return dict(direct)

    compact = normalized.replace(" ", "")
    e_match = re.search(r"\be(\d{3,4}[a-z]?)\b", normalized)
    if e_match:
        code = f"e{e_match.group(1)}"
        hit = index.get(code)
        if hit:
            return dict(hit)

    # Candidate set from shared tokens (much smaller than full 9k scan).
    candidates: set[str] = set()
    for token in normalized.split():
        if len(token) < 3:
            continue
        for key in token_postings.get(token, []):
            candidates.add(key)

    search_keys = sorted(candidates, key=len, reverse=True) if candidates else sorted_keys[:400]
    for key in search_keys:
        if len(key) < 4 or len(key) > len(normalized) + 8:
            continue
        if key in SKIP_CONTAINS:
            continue
        row = index.get(key)
        if not row:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", normalized):
            return dict(row)
        compact_key = key.replace(" ", "")
        if len(compact_key) >= 4 and re.search(
            rf"(?<![a-z0-9]){re.escape(compact_key)}(?![a-z0-9])",
            compact,
        ):
            return dict(row)
    return None


def enrich_flag_with_knowledge(flag: dict) -> dict:
    """Attach knowledge + feature flags onto an allergy-engine flag dict."""
    if not isinstance(flag, dict):
        return flag
    ingredient = str(flag.get("ingredient") or flag.get("name") or "")
    knowledge = lookup_ingredient_knowledge(ingredient)
    if not knowledge and flag.get("matched_kb_entry"):
        knowledge = lookup_ingredient_knowledge(str(flag.get("matched_kb_entry")))
    out = dict(flag)
    if knowledge:
        out["knowledge"] = {
            "title": knowledge["ingredient_name"],
            "category": knowledge["category"],
            "what_it_is": knowledge["what_it_is"],
            "commonly_seen_in": knowledge["commonly_seen_in"],
            "possible_effects": knowledge["possible_effects"],
            "affects_allergens": knowledge.get("affects_allergens") or [],
            "affects_diets": knowledge.get("affects_diets") or [],
            "source": knowledge["source"],
            "aliases": knowledge["aliases"],
        }
        if not out.get("possible_effects") and knowledge.get("possible_effects"):
            out["possible_effects"] = knowledge["possible_effects"]
        if not out.get("affects_allergens") and knowledge.get("affects_allergens"):
            out["affects_allergens"] = list(knowledge["affects_allergens"])
        if not out.get("affects_diets") and knowledge.get("affects_diets"):
            out["affects_diets"] = list(knowledge["affects_diets"])
        if not out.get("plain_explanation") and knowledge.get("possible_effects"):
            out["plain_explanation"] = knowledge["possible_effects"]
    return out
