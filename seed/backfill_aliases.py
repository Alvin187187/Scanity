"""Backfill aliases for allergen + ingredient knowledge rows that were expanded empty."""

from __future__ import annotations

import csv
import re
from pathlib import Path

ALLERGEN_SEED = Path(__file__).parent / "seed_allergens.csv"
KNOWLEDGE_SEED = Path(__file__).parent / "ingredient_knowledge.csv"

SKIP_PARTS = {
    "and",
    "or",
    "with",
    "the",
    "of",
    "for",
    "from",
    "less",
    "than",
    "contains",
    "ingredients",
    "water",
    "salt",
    "sugar",
    "natural",
    "artificial",
    "organic",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _phrase_aliases(name: str, *, max_aliases: int = 8) -> str:
    """Build pipe aliases from meaningful sub-phrases inside a label phrase."""
    base = _normalize(name)
    if not base:
        return ""
    parts = re.split(r"[,;/]| and | with |\(|\)|\[|\]", base)
    aliases: list[str] = []
    seen = {base.lower()}
    for part in parts:
        token = _normalize(part)
        key = token.lower()
        if not token or key in seen or key in SKIP_PARTS:
            continue
        if len(token) < 4 or len(token) > 80:
            continue
        if token.count(" ") > 5:
            continue
        # Skip pure numbers / junk
        if re.fullmatch(r"[\d.%]+", token):
            continue
        seen.add(key)
        aliases.append(token)
        if len(aliases) >= max_aliases:
            break

    # Also add a compact no-punctuation form when useful.
    compact = re.sub(r"[^a-zA-Z0-9 ]+", " ", base)
    compact = _normalize(compact)
    if compact and compact.lower() not in seen and compact.lower() != base.lower():
        aliases.append(compact)

    return " | ".join(aliases)


def _merge_aliases(existing: str, generated: str) -> str:
    seen: set[str] = set()
    out: list[str] = []
    for chunk in f"{existing} | {generated}".split("|"):
        item = _normalize(chunk)
        key = item.lower()
        if not item or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return " | ".join(out)


def backfill_allergens() -> tuple[int, int]:
    with ALLERGEN_SEED.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    updated = 0
    kept = 0
    for row in rows:
        name = _normalize(row.get("ingredient_name") or "")
        existing = _normalize(row.get("aliases") or "")
        if existing:
            kept += 1
            # Still enrich long label phrases with sub-phrase aliases.
            if len(name) > 28 or "," in name or "(" in name:
                merged = _merge_aliases(existing, _phrase_aliases(name))
                if merged != existing:
                    row["aliases"] = merged
                    updated += 1
            continue
        generated = _phrase_aliases(name)
        if not generated:
            # Single-token derivatives: add spaced / hyphen variants.
            variants = []
            if " " in name:
                variants.append(name.replace(" ", "-"))
                variants.append(name.replace(" ", ""))
            if variants:
                generated = " | ".join(variants)
        if generated:
            row["aliases"] = generated
            updated += 1

    fieldnames = [
        "ingredient_name",
        "aliases",
        "allergen_category",
        "source",
        "plain_explanation",
        "verified",
    ]
    with ALLERGEN_SEED.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return updated, kept


def backfill_knowledge() -> tuple[int, int]:
    with KNOWLEDGE_SEED.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    updated = 0
    kept = 0
    for row in rows:
        name = _normalize(row.get("ingredient_name") or "")
        existing = _normalize(row.get("aliases") or "")
        if existing:
            kept += 1
            continue
        generated = _phrase_aliases(name, max_aliases=6)
        if not generated and " " in name:
            generated = " | ".join(
                part
                for part in (name.replace(" ", "-"), name.replace(" ", ""))
                if part.lower() != name.lower()
            )
        if generated:
            row["aliases"] = generated
            updated += 1

    fieldnames = [
        "ingredient_name",
        "aliases",
        "category",
        "what_it_is",
        "commonly_seen_in",
        "possible_effects",
        "source",
    ]
    with KNOWLEDGE_SEED.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return updated, kept


if __name__ == "__main__":
    a_upd, a_kept = backfill_allergens()
    k_upd, k_kept = backfill_knowledge()
    print(f"allergens: updated={a_upd} already_had={a_kept}")
    print(f"knowledge: updated={k_upd} already_had={k_kept}")
