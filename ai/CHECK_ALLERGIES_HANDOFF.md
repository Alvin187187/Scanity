# check_allergies - Backend Handoff (#170)

## File and function

**Path:** `ai/allergy_engine.py`

```python
def check_allergies(user_allergies: list, ingredients: list) -> list[dict]
def overall_verdict(flags: list[dict]) -> str
```

## Input shape

- `user_allergies`: list[str]. Allergen names as stored in the user profile. Free-text synonyms accepted - "dairy", "Tree Nuts", "soybeans", "shell fish" all map to the correct seed category. Seed-native slugs ("milk", "tree_nuts") work unchanged.
- `ingredients`: list[str]. Raw ingredient strings. Non-string entries are guarded (logged + flagged caution), never raise.

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

`overall_verdict(flags)` returns a single string: "avoid", "caution", or "safe".
Precedence is avoid > caution > safe.

## Copy-paste example

```python
from ai.allergy_engine import check_allergies, overall_verdict

user_allergies = ["dairy"]
ingredients = ["sugar", "sodium caseinate", "salt"]

flags = check_allergies(user_allergies, ingredients)
verdict = overall_verdict(flags)

for f in flags:
    print(f["ingredient"], "->", f["status"], "|", f["reason"])

print("Overall verdict:", verdict)
```

## Behavior notes

- Category synonyms: dairy -> milk, tree nuts / Tree Nuts -> tree_nuts, soybeans -> soy, shell fish -> shellfish, plus singular/plural variants. Defined in CATEGORY_SYNONYMS.
- Empty ingredient list returns "caution", not "safe".
- Unmapped ingredients return "caution" and log a warning, never "safe".
- Non-string input is guarded: logged, flagged "caution", does not raise AttributeError.
- No LLM in the verdict path. Gemini is never called by this function.

## Known limitations (MVP scope)

- Matching is exact-string after normalization. Token/punctuation matching for OCR-style labels is not implemented.
- Common labels (cheese, yogurt, skim milk, organic milk, cheddar cheese, half-and-half) are not yet in the seed, so they return "caution" rather than "avoid". Needs seed aliases - a seed change, not an engine change.

## Test

Run from the repo root:

    python ai/test_required.py

11 tests, all passing.