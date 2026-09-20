"""Load curated ingredient knowledge for clickable chip explain panels.

This sits beside the allergen seed. Allergy matching still comes from
seed_allergens. This file explains what an ingredient / E-number is
without requiring a live AI call when a local note exists.
"""

from __future__ import annotations

import csv
import re
from functools import lru_cache
from pathlib import Path

SEED_FILE_PATH = Path(__file__).parent / "ingredient_knowledge.csv"


def _normalize(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


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
                    "source": (raw.get("source") or "").strip(),
                }
            )
    return rows


def _build_index(rows: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for row in rows:
        keys = [row["ingredient_name"], *row.get("aliases", [])]
        for key in keys:
            norm = _normalize(key)
            if norm and norm not in index:
                index[norm] = row
    return index


def lookup_ingredient_knowledge(ingredient: str) -> dict | None:
    """Return knowledge for an ingredient name or E-number, or None."""
    if not isinstance(ingredient, str) or not ingredient.strip():
        return None
    index = _build_index(load_ingredient_knowledge())
    normalized = _normalize(ingredient)
    direct = index.get(normalized)
    if direct:
        return dict(direct)

    # Labels often say "colour: e100" or "e330 (citric acid)".
    compact = normalized.replace(" ", "")
    e_match = re.search(r"\be(\d{3,4}[a-z]?)\b", normalized)
    if e_match:
        code = f"e{e_match.group(1)}"
        hit = index.get(code)
        if hit:
            return dict(hit)

    # Contained alias with word boundaries (longer keys first).
    for key, row in sorted(index.items(), key=lambda item: len(item[0]), reverse=True):
        if len(key) < 4:
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
    """Attach CSV knowledge onto an allergy-engine flag dict."""
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
            "source": knowledge["source"],
            "aliases": knowledge["aliases"],
        }
    return out
