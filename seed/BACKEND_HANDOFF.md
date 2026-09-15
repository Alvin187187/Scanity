## Backend Handoff

**Function:** `load_allergen_seed`
**Path:** `seed/allergen_seed_loader.py`

**Input shape:** `csv_path: str = None` (optional override; defaults to `seed/seed_allergens.csv`)

**Output shape:** `list[dict]`, one dict per ingredient:
```python
{
    "ingredient_name": str,
    "aliases": list[str],
    "allergen_category": str,  # milk, egg, peanut, tree_nuts, soy, wheat, fish, shellfish
    "source": str,
    "plain_explanation": str,
    "verified": bool,
}
```

**Copy-paste example:**
```python
from seed.allergen_seed_loader import load_allergen_seed

data = load_allergen_seed()
print(f"Loaded {len(data)} rows")
print(data[0])
```