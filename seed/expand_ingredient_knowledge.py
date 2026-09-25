"""
seed/expand_ingredient_knowledge.py

Grow ingredient_knowledge.csv toward 5k+ rows using common additives and
unique phrases from the allergen datasets (non-allergen pantry / additive notes).
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BASE = Path(__file__).parent / "ingredient_knowledge.csv"
SOURCE_10K = REPO / "BackEnd" / "Seed data" / "Allergens" / "Allergen_Datasets - allergies_10k.csv"
SOURCE_FOOD = (
    REPO
    / "BackEnd"
    / "Seed data"
    / "Allergens"
    / "Allergen_Datasets - food_ingredients_and_allergens.csv"
)
OUT = BASE

# Common E-numbers / additives with short shopper notes (seeded bulk).
E_NUMBER_NOTES = {
    "E100": ("Curcumin", "colour", "Yellow colour from turmeric.", "Processed foods, sauces", "Usually fine; rare turmeric sensitivity."),
    "E101": ("Riboflavin", "colour", "Vitamin B2 used as yellow colour / nutrient.", "Fortified foods", "Generally safe."),
    "E102": ("Tartrazine", "colour", "Synthetic yellow azo dye.", "Sweets, drinks", "Some people report sensitivity; watch if dye-sensitive."),
    "E110": ("Sunset Yellow", "colour", "Synthetic orange-yellow azo dye.", "Snacks, drinks", "Sensitivity possible in dye-reactive people."),
    "E120": ("Carmine", "colour", "Red colour from cochineal insects.", "Yogurts, sweets, drinks", "Not vegan; rare allergy reports."),
    "E129": ("Allura Red", "colour", "Synthetic red azo dye.", "Candies, drinks", "Sensitivity possible in dye-reactive people."),
    "E133": ("Brilliant Blue", "colour", "Synthetic blue dye.", "Sweets, drinks", "Usually fine; rare sensitivity."),
    "E150a": ("Plain caramel", "colour", "Browned sugar colour.", "Sodas, sauces", "Adds colour; not a classic allergen."),
    "E150d": ("Sulphite ammonia caramel", "colour", "Dark caramel colour used in colas.", "Soft drinks, sauces", "May matter if avoiding sulphites."),
    "E160a": ("Carotenes", "colour", "Orange colour from carotene.", "Spreads, drinks", "Generally safe."),
    "E160c": ("Paprika extract", "colour", "Natural red-orange colour from paprika.", "Snacks, sauces", "Usually fine; nightshade-sensitive people may notice."),
    "E200": ("Sorbic acid", "preservative", "Slows mold and yeast.", "Cheese, baked goods", "Safe within limits; rare irritation."),
    "E202": ("Potassium sorbate", "preservative", "Common mold inhibitor.", "Drinks, dairy, baked goods", "Usually well tolerated."),
    "E211": ("Sodium benzoate", "preservative", "Slows yeast and bacteria in acidic foods.", "Soft drinks, sauces", "Safe within limits; confirm label if sensitive."),
    "E220": ("Sulphur dioxide", "preservative", "Preservative / antioxidant; sulphite family.", "Dried fruit, wine, packaged foods", "Can trigger asthma in sulphite-sensitive people."),
    "E223": ("Sodium metabisulphite", "preservative", "Sulphite preservative.", "Dried fruit, seafood, wine", "Avoid if sulphite-sensitive."),
    "E250": ("Sodium nitrite", "preservative", "Curing salt for pink colour and preservation.", "Bacon, ham, hot dogs", "Limit frequent cured-meat intake."),
    "E251": ("Sodium nitrate", "preservative", "Curing agent related to nitrite.", "Cured meats", "Same caution as cured meats."),
    "E300": ("Ascorbic acid", "antioxidant", "Vitamin C; slows browning.", "Juices, cured meats", "Generally safe."),
    "E322": ("Lecithin", "emulsifier", "Helps mix oil and water.", "Chocolate, baked goods", "Soy lecithin may matter for soy allergy."),
    "E330": ("Citric acid", "acidulant", "Sour acid for tartness and preservation.", "Drinks, candy, canned foods", "Can irritate mouth/stomach if sensitive."),
    "E407": ("Carrageenan", "thickener", "Seaweed thickener.", "Plant milks, desserts", "Some people report gut sensitivity."),
    "E412": ("Guar gum", "thickener", "Plant fiber gum thickener.", "Ice cream, sauces", "May cause gas/bloating for some."),
    "E415": ("Xanthan gum", "thickener", "Fermented gum thickener.", "Sauces, gluten-free baking", "Can cause bloating at higher amounts."),
    "E440": ("Pectin", "thickener", "Fruit fiber used to gel.", "Jams, jellies", "Generally gentle."),
    "E450": ("Diphosphates", "emulsifier", "Phosphate salts for texture / leavening.", "Processed meats, baking powder", "Adds phosphorus; watch if kidney diet restricted."),
    "E471": ("Mono- and diglycerides", "emulsifier", "Fat-based emulsifiers.", "Bread, ice cream", "Usually low allergy risk."),
    "E500": ("Sodium carbonates", "acidity regulator", "Baking soda family.", "Baked goods", "Everyday pantry item."),
    "E621": ("Monosodium glutamate", "flavour enhancer", "MSG; boosts savory taste.", "Snacks, soups, noodles", "Some people report sensitivity; not a classic allergen."),
    "E951": ("Aspartame", "sweetener", "Intense low-calorie sweetener.", "Diet drinks, gum", "Avoid if you have PKU; otherwise within limits."),
    "E955": ("Sucralose", "sweetener", "Intense sweetener.", "Diet drinks, sweets", "Generally recognized as safe within limits."),
}


def _normalize(name: str) -> str:
    value = re.sub(r"\s+", " ", (name or "").strip())
    return value[:160]


def _load_existing() -> list[dict]:
    rows: list[dict] = []
    with BASE.open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            name = _normalize(raw.get("ingredient_name") or "")
            if not name:
                continue
            rows.append(
                {
                    "ingredient_name": name,
                    "aliases": (raw.get("aliases") or "").strip(),
                    "category": (raw.get("category") or "").strip(),
                    "what_it_is": (raw.get("what_it_is") or "").strip(),
                    "commonly_seen_in": (raw.get("commonly_seen_in") or "").strip(),
                    "possible_effects": (raw.get("possible_effects") or "").strip(),
                    "source": (raw.get("source") or "").strip(),
                }
            )
    return rows


def _split_tokens(phrase: str) -> list[str]:
    parts = re.split(r"[,;:/()]| and | with ", phrase.lower())
    skip = {
        "extract",
        "powder",
        "oil",
        "flavor",
        "flavour",
        "natural",
        "artificial",
        "organic",
        "blend",
        "mix",
        "base",
        "water",
        "salt",
        "sugar",
        "acid",
        "color",
        "colour",
        "spice",
        "spices",
        "seasoning",
        "ingredients",
        "contains",
        "less",
        "than",
        "percent",
        "pure",
        "fresh",
    }
    out: list[str] = []
    for part in parts:
        token = _normalize(part)
        if len(token) < 4 or len(token) > 60:
            continue
        if token.lower() in skip:
            continue
        if any(ch.isdigit() for ch in token) and not token.lower().startswith("e"):
            if not re.fullmatch(r"e\d{3,4}[a-z]?", token.lower().replace(" ", "")):
                continue
        if token.count(" ") > 5:
            continue
        out.append(token)
    return out


def expand(target: int = 5000) -> int:
    rows = _load_existing()
    seen = {r["ingredient_name"].lower() for r in rows}

    for code, (title, category, what, seen_in, effects) in E_NUMBER_NOTES.items():
        for name in (code, title):
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "ingredient_name": name,
                    "aliases": code if name != code else title,
                    "category": category,
                    "what_it_is": what,
                    "commonly_seen_in": seen_in,
                    "possible_effects": effects,
                    "source": "European Food Safety Authority (EFSA) additive summaries",
                }
            )

    # Pull unique short tokens from datasets for broad coverage.
    sources = [p for p in (SOURCE_10K, SOURCE_FOOD) if p.is_file()]
    for path in sources:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for raw in reader:
                phrase = raw.get("ingredient") or raw.get("ingredients") or raw.get("ingredient_name") or ""
                for token in _split_tokens(phrase):
                    key = token.lower()
                    if key in seen:
                        continue
                    seen.add(key)
                    rows.append(
                        {
                            "ingredient_name": token.title() if token.islower() else token,
                            "aliases": "",
                            "category": "label ingredient",
                            "what_it_is": (
                                f"A food-label ingredient phrase (“{token}”) seen in packaged products. "
                                "Tap AI research for a deeper plain-language note when needed."
                            ),
                            "commonly_seen_in": "Packaged and processed foods",
                            "possible_effects": (
                                "Effects depend on the exact ingredient and your sensitivities. "
                                "Confirm the package if you are unsure."
                            ),
                            "source": path.name,
                        }
                    )
                    if len(rows) >= target:
                        break
            if len(rows) >= target:
                break

    fieldnames = [
        "ingredient_name",
        "aliases",
        "category",
        "what_it_is",
        "commonly_seen_in",
        "possible_effects",
        "source",
    ]
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT}")
    return len(rows)


if __name__ == "__main__":
    expand(5000)
