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


_E_CODE = re.compile(r"e\d{3,4}[a-z]?$")
_AMOUNT_RE = re.compile(
    r"\([^)]*\d[^)]*\)|\b\d+(?:[.,]\d+)?\s*(?:g|mg|kg|mcg|µg|ug|kcal|kj|%|ml|oz)\b",
    re.IGNORECASE,
)
_PLACEHOLDER_COPY = re.compile(
    r"tap ai|check the ai|could not fully|deeper plain-language|food-label ingredient phrase",
    re.IGNORECASE,
)


def clean_ingredient_label(value: str) -> str:
    """Drop amounts such as '17.45 g' so a chip name stays an ingredient."""
    text = _AMOUNT_RE.sub(" ", value or "")
    text = re.sub(r"\s+", " ", text).strip(" ,;:-/()[]{}")
    return text


def is_placeholder_copy(value: str) -> bool:
    return bool(_PLACEHOLDER_COPY.search(value or ""))


def _first_sentence(value: str) -> str:
    sentence = re.split(r"(?<=[.!?])\s+", (value or "").strip(), maxsplit=1)[0].strip()
    if len(sentence) > 180:
        return sentence[:177].rstrip() + "…"
    return sentence


def _row_names_this_ingredient(ingredient: str, knowledge: dict | None) -> bool:
    """True when this knowledge row is that ingredient, not a loose overlap."""
    normalized = _normalize(clean_ingredient_label(ingredient) or ingredient)
    if not normalized or not knowledge:
        return False
    names = [_normalize(str(knowledge.get("ingredient_name") or ""))]
    names.extend(_normalize(str(alias)) for alias in (knowledge.get("aliases") or []))
    names = [name for name in names if name]
    if normalized in names:
        return True
    compact = normalized.replace(" ", "")
    if any(name.replace(" ", "") == compact for name in names):
        return True
    e_match = re.search(r"\be(\d{3,4}[a-z]?)\b", normalized)
    if e_match and any(name.replace(" ", "") == f"e{e_match.group(1)}" for name in names):
        return True
    canonical = _normalize(str(knowledge.get("ingredient_name") or ""))
    if (
        canonical
        and len(canonical) >= 4
        and not _is_phrase_row(knowledge)
        and re.search(rf"(?<![a-z0-9]){re.escape(canonical)}(?![a-z0-9])", normalized)
    ):
        return True
    return False


def chip_title(ingredient: str, knowledge: dict | None = None) -> str:
    """Chip label is the product ingredient. Canonical names are for exact or E-number hits only."""
    cleaned = clean_ingredient_label(ingredient) or str(ingredient or "").strip()
    if not knowledge or not _row_names_this_ingredient(cleaned, knowledge):
        return cleaned
    normalized = _normalize(cleaned)
    canonical = str(knowledge.get("ingredient_name") or "").strip()
    names = [_normalize(canonical)]
    names.extend(_normalize(str(alias)) for alias in (knowledge.get("aliases") or []))
    e_match = re.search(r"\be(\d{3,4}[a-z]?)\b", normalized)
    if normalized in names or e_match:
        return canonical or cleaned
    return cleaned


def shopper_definition(ingredient: str, knowledge: dict | None = None) -> str:
    """One accurate sentence. Never a 'check the AI' placeholder."""
    cleaned = clean_ingredient_label(ingredient) or str(ingredient or "").strip()
    display = cleaned[:1].upper() + cleaned[1:] if cleaned else "This ingredient"
    named = bool(knowledge) and _row_names_this_ingredient(cleaned, knowledge)
    what = ""
    allergens: list[str] = []
    if named and knowledge:
        raw = str(knowledge.get("what_it_is") or "").strip()
        if raw and not is_placeholder_copy(raw):
            what = _first_sentence(raw)
        allergens = [
            str(item).replace("_", " ").strip()
            for item in (knowledge.get("affects_allergens") or [])
            if str(item).strip()
        ]
    exact = False
    if named and knowledge:
        normalized = _normalize(cleaned)
        exact_names = [_normalize(str(knowledge.get("ingredient_name") or ""))]
        exact_names.extend(_normalize(str(alias)) for alias in (knowledge.get("aliases") or []))
        e_match = re.search(r"\be(\d{3,4}[a-z]?)\b", normalized)
        exact = normalized in exact_names or bool(e_match)
    if exact and what:
        if allergens and not any(item.lower() in what.lower() for item in allergens[:3]):
            return f"{what} Linked to {', '.join(allergens[:3])}."
        return what
    if allergens:
        return f"{display} is listed on this product. It is linked to {', '.join(allergens[:3])}."
    return f"{display} is listed on this product."


def _is_phrase_row(row: dict) -> bool:
    """Whole-recipe label lines should not donate or receive feature flags."""
    name = str(row.get("ingredient_name") or "")
    if any(char in name for char in ",()[]{}"):
        return True
    normalized = _normalize(name)
    return len(normalized) > 48 or len(normalized.split()) > 5


def _linkable_key(key: str, canonical_names: set[str]) -> bool:
    if not key or key in SKIP_CONTAINS:
        return False
    if _E_CODE.fullmatch(key.replace(" ", "")):
        return True
    return key in canonical_names


def _union_flags(rows: list[dict], field: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for item in row.get(field) or []:
            text = str(item).strip()
            token = text.lower()
            if not text or token in seen:
                continue
            seen.add(token)
            found.append(text)
    return found


def _share_flags_across_aliases(rows: list[dict]) -> None:
    """
    Rows that share an E-number or a canonical name/alias are the same additive.

    Diet and allergen flags are copied from the specific rows onto every
    specific row in that group, so a later alias line is as usable as the
    curated line that carries the flag.
    """
    canonical_names = {
        _normalize(str(row.get("ingredient_name") or ""))
        for row in rows
        if row.get("ingredient_name") and not _is_phrase_row(row)
    }
    canonical_names.discard("")
    parent = list(range(len(rows)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left: int, right: int) -> None:
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    buckets: dict[str, list[int]] = {}
    for index, row in enumerate(rows):
        # A recipe line that mentions maltodextrin must not pull wheat or milk
        # onto the maltodextrin row.
        if _is_phrase_row(row):
            continue
        seen: set[str] = set()
        for key in [row.get("ingredient_name"), *row.get("aliases", [])]:
            normalized = _normalize(str(key or ""))
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            if not _linkable_key(normalized, canonical_names):
                continue
            buckets.setdefault(normalized, []).append(index)
    for indexes in buckets.values():
        head = indexes[0]
        for other in indexes[1:]:
            union(head, other)

    clusters: dict[int, list[int]] = {}
    for index in range(len(rows)):
        clusters.setdefault(find(index), []).append(index)

    for indexes in clusters.values():
        sources = [rows[index] for index in indexes if not _is_phrase_row(rows[index])]
        diets = _union_flags(sources, "affects_diets")
        allergens = _union_flags(sources, "affects_allergens")
        if not diets and not allergens:
            continue
        for index in indexes:
            row = rows[index]
            if _is_phrase_row(row):
                continue
            if diets:
                row["affects_diets"] = list(diets)
            if allergens:
                row["affects_allergens"] = list(allergens)


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
    if "ai/ml" in low or "generated" in low or "codex" in low:
        if "efsa" in low:
            return "European Food Safety Authority (EFSA) additive summaries"
        if "nutrition" in low:
            return "World Health Organization and USDA nutrition references"
        return "European Food Safety Authority (EFSA) and USDA food references"
    if "efsa" in low:
        return "European Food Safety Authority (EFSA) additive summaries"
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
    rows = [dict(row, aliases=list(row.get("aliases") or [])) for row in load_ingredient_knowledge()]
    _share_flags_across_aliases(rows)
    def _flag_score(row: dict) -> int:
        return len(row.get("affects_diets") or []) + len(row.get("affects_allergens") or [])

    def _prefer(candidate: dict, current: dict | None) -> bool:
        if current is None:
            return True
        candidate_phrase = _is_phrase_row(candidate)
        current_phrase = _is_phrase_row(current)
        if candidate_phrase != current_phrase:
            return not candidate_phrase
        return _flag_score(candidate) > _flag_score(current)

    for row in rows:
        keys = [row["ingredient_name"], *row.get("aliases", [])]
        for key in keys:
            norm = _normalize(key)
            if not norm:
                continue
            if not _prefer(row, index.get(norm)):
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


def _display_category(row: dict) -> str:
    category = str(row.get("category") or "").strip().lower()
    allergens = row.get("affects_allergens") or []
    additive_words = (
        "additive",
        "colour",
        "color",
        "sweetener",
        "preservative",
        "emulsifier",
        "stabil",
        "antioxidant",
        "flavour",
        "flavor",
    )
    if "allergen" in category or (allergens and not category):
        return "Allergen"
    if any(word in category for word in additive_words):
        return "Additive"
    if category:
        return "Ingredient"
    return "Food term"


def _term_in_key(key: str, term: str) -> bool:
    """Match a whole word. 'rice' must not hit inside 'licorice'."""
    if not key or not term:
        return False
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", key))


def search_ingredient_knowledge(query: str, limit: int = 8) -> list[dict]:
    """Rank ingredient, additive, and allergen rows for a shopper search."""
    normalized = _normalize(query)
    if len(normalized) < 2:
        return []
    cap = max(1, min(int(limit or 8), 12))
    query_tokens = [token for token in normalized.split() if len(token) >= 2]
    scored: list[tuple[int, int, str, dict]] = []
    for row in load_ingredient_knowledge():
        name = str(row.get("ingredient_name") or "").strip()
        if not name or len(name) > 80:
            continue
        keys = [_normalize(name), *[_normalize(alias) for alias in row.get("aliases") or []]]
        best = 0
        for key in keys:
            if not key:
                continue
            if key == normalized:
                best = max(best, 100)
            elif key.startswith(normalized) or normalized.startswith(key):
                best = max(best, 80)
            elif _term_in_key(key, normalized):
                best = max(best, 60)
            elif query_tokens and all(_term_in_key(key, token) for token in query_tokens):
                best = max(best, 40)
        if best:
            scored.append((best, len(name), name.lower(), row))
    scored.sort(key=lambda item: (-item[0], item[1], item[2]))
    results: list[dict] = []
    seen: set[str] = set()
    for _, _, _, row in scored:
        name = row["ingredient_name"]
        if name in seen:
            continue
        seen.add(name)
        item = dict(row)
        item["display_category"] = _display_category(row)
        results.append(item)
        if len(results) >= cap:
            break
    return results


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
        # Short single words ("milk", "nut", "oil") must not rename a different ingredient.
        if " " not in key and len(key) < 8:
            continue
        row = index.get(key)
        if not row or _is_phrase_row(row):
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", normalized):
            return dict(row)
        compact_key = key.replace(" ", "")
        if " " in key and len(compact_key) >= 8 and re.search(
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
    named = bool(knowledge) and _row_names_this_ingredient(ingredient, knowledge)
    definition = shopper_definition(ingredient, knowledge if named else None)
    plain = str(out.get("plain_explanation") or "").strip()
    if not plain or is_placeholder_copy(plain):
        out["plain_explanation"] = definition
    if not knowledge:
        return out
    if not named:
        # A loose hit must not rename the chip or borrow another ingredient's allergens.
        out["knowledge"] = {
            "title": chip_title(ingredient),
            "category": "",
            "what_it_is": definition,
            "commonly_seen_in": "",
            "possible_effects": "",
            "affects_allergens": [],
            "affects_diets": [],
            "source": "",
            "aliases": [],
        }
        return out
    what = str(knowledge.get("what_it_is") or "").strip()
    if not what or is_placeholder_copy(what):
        what = definition
    effects = str(knowledge.get("possible_effects") or "").strip()
    if is_placeholder_copy(effects):
        effects = ""
    out["knowledge"] = {
        "title": chip_title(ingredient, knowledge),
        "category": knowledge["category"],
        "what_it_is": what,
        "commonly_seen_in": knowledge["commonly_seen_in"],
        "possible_effects": effects,
        "affects_allergens": knowledge.get("affects_allergens") or [],
        "affects_diets": knowledge.get("affects_diets") or [],
        "source": knowledge["source"],
        "aliases": knowledge["aliases"],
    }
    if not out.get("possible_effects") and effects:
        out["possible_effects"] = effects
    out["affects_allergens"] = _union_flags(
        [{"affects_allergens": out.get("affects_allergens")}, knowledge],
        "affects_allergens",
    )
    out["affects_diets"] = _union_flags(
        [{"affects_diets": out.get("affects_diets")}, knowledge],
        "affects_diets",
    )
    return out
