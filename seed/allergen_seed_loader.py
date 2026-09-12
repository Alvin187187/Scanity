"""
seed/allergen_seed_loader.py

Loads the AI/ML-provided allergen seed data for Backend to insert into the
INGREDIENTS table (and, once the alias-table schema question is resolved
with Backend, the aliases as well).

Ticket: #168 seed (SVheinr)
"""
import csv
from pathlib import Path

SEED_FILE_PATH = Path(__file__).parent / "seed_allergens.csv"


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
            "aliases": list[str],       # split from the ' | ' delimited column
            "allergen_category": str,   # one of: milk, egg, peanut, tree_nuts,
                                         # soy, wheat, fish, shellfish
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
            rows.append({
                "ingredient_name": r["ingredient_name"],
                "aliases": [a.strip() for a in r["aliases"].split("|") if a.strip()],
                "allergen_category": r["allergen_category"],
                "source": r["source"],
                "plain_explanation": r["plain_explanation"],
                "verified": r["verified"].strip().lower() == "true",
            })
    return rows


if __name__ == "__main__":
    # Quick manual sanity check when run directly: python seed/allergen_seed_loader.py
    data = load_allergen_seed()
    print(f"Loaded {len(data)} rows")
    print(data[0])