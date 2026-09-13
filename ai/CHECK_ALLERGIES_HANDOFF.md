# check_allergies - Backend Handoff

## File and function

**Path:** `ai/allergy_engine.py`
**Function:** `check_allergies`

```python
def check_allergies(user_allergies: list[str], ingredients: list[str]) -> list[dict]
```

## Input shape

- `user_allergies`: list of allergen category names, e.g. ["milk", "peanut"]
- `ingredients`: list of raw ingredient strings, e.g. ["sugar", "sodium caseinate"]

## Output shape

`list[dict]`, one entry per input ingredient:

```python
{
    "ingredient": "sodium caseinate",
    "status": "avoid",
    "matched_category": "milk",
    "matched_kb_entry": "Casein",
    "reason": "Matches your declared milk allergy (matched via alias to 'Casein').",
}
```

`status` is one of "avoid", "caution", or "safe". Unmapped ingredients return "caution", never "safe".

Get the overall verdict with the companion function in the same file:

```python
def overall_verdict(flags: list[dict]) -> str
```

Precedence: avoid > caution > safe.

## Copy-paste example

```python
from ai.allergy_engine import check_allergies, overall_verdict

flags = check_allergies(["milk"], ["sugar", "sodium caseinate", "salt"])
verdict = overall_verdict(flags)

print(flags)
print(verdict)
```

## Notes

- Reads from `seed/seed_allergens.csv` via the existing `load_allergen_seed()` loader.
- Gemini/any LLM is never called and does not influence the verdict.
- Unmapped ingredients are logged via Python logging and returned as "caution".