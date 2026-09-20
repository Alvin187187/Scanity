"""
seed/allergen_seed_loader.py

Loads the AI/ML-provided allergen seed data for Backend to insert into the
INGREDIENTS table (and, once the alias-table schema question is resolved
with Backend, the aliases as well).

Ticket: #167 seed (SVheinr)
"""
import csv
from pathlib import Path

SEED_FILE_PATH = Path(__file__).parent / "seed_allergens.csv"


def _shopper_source(raw: str | None) -> str:
    text = (raw or "").strip()
    if not text:
        return "Scanity allergen guide"
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


def load_allergen_seed(csv_path: str = None) -> list[dict]:
    """
    Load the allergen seed CSV into a list of plain dicts.

    Args:
        csv_path: optional override path. Defaults to seed/seed_allergens.csv
                  (the file shipped alongside this loader).

    Returns:
        list[dict], one dict per ingredient row:
        {
            "ingredient_name": str,
            "aliases": list[str],
            "allergen_category": str,
            "affects_allergens": list[str],
            "affects_diets": list[str],
            "possible_effects": str,
            "source": str,
            "plain_explanation": str,
            "verified": bool,
        }
    """
    path = Path(csv_path) if csv_path else SEED_FILE_PATH
    rows = []
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            category = (r.get("allergen_category") or "").strip()
            affects_allergens = [
                part.strip()
                for part in str(r.get("affects_allergens") or category).split("|")
                if part.strip()
            ]
            affects_diets = [
                part.strip()
                for part in str(r.get("affects_diets") or "").split("|")
                if part.strip()
            ]
            plain = (r.get("plain_explanation") or "").strip()
            effects = (r.get("possible_effects") or "").strip() or plain
            rows.append({
                "ingredient_name": r["ingredient_name"],
                "aliases": [a.strip() for a in str(r.get("aliases") or "").split("|") if a.strip()],
                "allergen_category": category,
                "affects_allergens": affects_allergens,
                "affects_diets": affects_diets,
                "possible_effects": effects,
                "source": _shopper_source(r.get("source")),
                "plain_explanation": plain or effects,
                "verified": str(r.get("verified") or "").strip().lower() == "true",
            })
    return rows


if __name__ == "__main__":
    # Quick manual sanity check when run directly: python seed/allergen_seed_loader.py
    data = load_allergen_seed()
    print(f"Loaded {len(data)} rows")
    print(data[0])