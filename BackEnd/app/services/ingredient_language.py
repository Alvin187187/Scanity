"""English layer for foreign packaged-food ingredient lists.

Open Food Facts often returns the label language (for example French or
German). When an English name is available, Scanity shows that instead.
"""

from __future__ import annotations

import re


def looks_foreign(text: str) -> bool:
    value = (text or "").strip()
    if not value:
        return False
    return any(ord(character) > 127 and character.isalpha() for character in value)


# Whole-word label terms that must reach the rule engine in English.
# Short tokens are exact-ingredient matches only, so "sel" cannot rewrite "seltzer".
_PHRASE_GLOSSARY = (
    ("harina de trigo", "wheat flour"),
    ("lait en poudre", "milk powder"),
    ("poudre de lait", "milk powder"),
    ("proteines de lait", "milk protein"),
    ("protéines de lait", "milk protein"),
    ("huile d'arachide", "peanut oil"),
    ("beurre de cacahuete", "peanut butter"),
    ("mantequilla de cacahuete", "peanut butter"),
    ("farine de ble", "wheat flour"),
    ("creme", "cream"),
    ("crème", "cream"),
    ("beurre", "butter"),
    ("lactoserum", "whey"),
    ("lactosérum", "whey"),
    ("caseinate", "caseinate"),
    ("arachide", "peanut"),
    ("arachides", "peanut"),
    ("cacahuete", "peanut"),
    ("cacahuate", "peanut"),
    ("erdnuss", "peanut"),
    ("noisette", "hazelnut"),
    ("noisettes", "hazelnut"),
    ("amande", "almond"),
    ("amandes", "almond"),
    ("sesame", "sesame"),
    ("sésame", "sesame"),
    ("moutarde", "mustard"),
    ("poisson", "fish"),
    ("crevette", "shrimp"),
    ("crevettes", "shrimp"),
    ("oeufs", "egg"),
    ("oeuf", "egg"),
    ("œuf", "egg"),
    ("œufs", "egg"),
    ("huevo", "egg"),
    ("weizen", "wheat"),
    ("gluten", "gluten"),
    ("ble", "wheat"),
    ("blé", "wheat"),
    ("soja", "soy"),
    ("milch", "milk"),
    ("leche", "milk"),
    ("lait", "milk"),
    ("sucre", "sugar"),
    ("azucar", "sugar"),
    ("azúcar", "sugar"),
    ("zucker", "sugar"),
)

_EXACT_GLOSSARY = {
    "sel": "salt",
    "sal": "salt",
    "ei": "egg",
    "uovo": "egg",
}


def _fold(text: str) -> str:
    folded = (text or "").lower()
    for source, target in (
        ("é", "e"),
        ("è", "e"),
        ("ê", "e"),
        ("ë", "e"),
        ("à", "a"),
        ("â", "a"),
        ("ô", "o"),
        ("û", "u"),
        ("ù", "u"),
        ("ç", "c"),
        ("œ", "oe"),
        ("æ", "ae"),
    ):
        folded = folded.replace(source, target)
    return folded


def translate_label_terms(text: str) -> tuple[str, bool]:
    """Replace known non-English label words so allergy rules can match them."""
    original = (text or "").strip()
    if not original:
        return "", False
    folded = _fold(original)
    exact = _EXACT_GLOSSARY.get(folded)
    if exact:
        return exact, True

    replaced = folded
    changed = False
    for source, english in _PHRASE_GLOSSARY:
        needle = _fold(source)
        pattern = rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])"
        if re.search(pattern, replaced):
            replaced = re.sub(pattern, english, replaced)
            changed = True
    if not changed:
        return original, False
    return re.sub(r"\s+", " ", replaced).strip(), True


def english_name_from_off_id(ingredient_id: str) -> str | None:
    raw = (ingredient_id or "").strip().lower()
    if not raw.startswith("en:"):
        return None
    name = raw[3:].replace("-", " ").replace("_", " ").strip()
    return name or None


def prefer_english_ingredient(ingredient: dict) -> tuple[str, bool]:
    """Return (display name, translated)."""
    original = str(ingredient.get("text") or "").strip()
    english = english_name_from_off_id(str(ingredient.get("id") or ""))
    if english and (not original or looks_foreign(original)):
        return english, bool(original)
    if english and original and original.lower() != english.lower() and looks_foreign(original):
        return english, True
    chosen = original or english or ""
    translated_name, translated = translate_label_terms(chosen)
    if translated:
        return translated_name, True
    return chosen, False


def prefer_english_ingredients_text(raw: dict) -> tuple[str, bool]:
    original = str(raw.get("ingredients_text") or "").strip()
    english = str(raw.get("ingredients_text_en") or "").strip()
    if english and (not original or looks_foreign(original)):
        return english, bool(original) and original != english
    chosen = original or english
    translated_name, translated = translate_label_terms(chosen)
    if translated:
        return translated_name, True
    return chosen, False
