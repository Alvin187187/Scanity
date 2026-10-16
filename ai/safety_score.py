"""
Personal safety score for one shopper and one product.

The number is an evidence index from 0 to 100. It is not a probability, not
a clinical dose, and not Nutri-Score. Gemini never chooses it.

Band (Safe / Caution / Avoid) comes only from rule flags. Position inside
the band comes from how many of those flags fired and, when a saved
condition has a published per-100 g cut-off, from the UK front-of-pack
traffic lights (Department of Health, 2016).

Each path has a written anchor so the same flags and the same nutrients
always rebuild the same number. ``build_safety_score`` returns that
arithmetic. Callers show it instead of asking a model to invent a reason.
"""

from __future__ import annotations

import re

SYSTEM_ID = "scanity-evidence-v1"

# Band edges shared with the verdict. Inclusive.
SAFE_MIN = 70
CAUTION_MIN = 40
AVOID_MAX = 39

# One verified avoid lands 7 points under the top of Avoid (39 - 7 = 32)
# so a single confirmed hit cannot be read as the Caution floor (40).
AVOID_ANCHOR = 32
AVOID_EXTRA_HIT = 8
AVOID_RED = 4
AVOID_AMBER = 2
AVOID_UNKNOWN_CAP = 4

# A "may contain" declaration for a saved allergy. Real, but not an ingredient hit.
TRACE_ANCHOR = 50
TRACE_EXTRA = 6
TRACE_FLOOR = 40

# One unidentified ingredient sits 6 under the Safe floor (70 - 6 = 64).
UNKNOWN_ANCHOR = 64
UNKNOWN_STEP = 3
UNKNOWN_FLOOR = 46

# No list to check. 12 under the Safe floor (70 - 12 = 58): not Safe, and
# milder than a confirmed condition hit.
INCOMPLETE_ANCHOR = 58

# Condition caution, by the worst relevant UK front-of-pack band.
CONDITION_ANCHOR = {
    "none": 58,
    "green": 58,
    "amber": 50,
    "red": 42,
}
CONDITION_EXTRA = 4
CONDITION_FLOOR = 40
CONDITION_UNKNOWN_CAP = 4

SAFE_SCORE = 100

# UK Department of Health, Guide to creating a front of pack (FoP)
# nutrition label for pre-packed products sold through retail outlets
# (2016). Per 100 g. High means over the line, not equal to it.
# Salt (g) = sodium (g) × 2.5, so sodium low ≤ 120 mg and high > 600 mg.
FSA_NUTRIENTS: dict[str, dict] = {
    "sugars_g": {
        "low": 5.0,
        "high": 22.5,
        "unit": "g/100g",
        "label": "Sugars",
        "flag_name": "Sugars",
        "verb": "are",
        "conditions": ("diabetes",),
    },
    "sat_fat_g": {
        "low": 1.5,
        "high": 5.0,
        "unit": "g/100g",
        "label": "Saturated fat",
        "flag_name": "Sat. fat",
        "verb": "is",
        "conditions": ("heart",),
    },
    "sodium_mg": {
        "low": 120.0,
        "high": 600.0,
        "unit": "mg/100g",
        "label": "Sodium",
        "flag_name": "Sodium",
        "verb": "is",
        "conditions": ("hypertension", "kidney", "heart"),
    },
}

_BAND_RANK = {"none": 0, "green": 1, "amber": 2, "red": 3}

_FRIENDLY_CONDITION = {
    "diabetes": "diabetes",
    "lactose": "lactose intolerance",
    "celiac": "celiac disease",
    "hypertension": "high blood pressure",
    "kidney": "kidney disease",
    "heart": "heart disease",
    "ibs": "IBS",
}

# Panel rows look like "Sugars 18 g/100g". Ingredient names such as
# "sodium caseinate" must not match.
_NUTRITION_LINE = re.compile(r"^(sugars|sodium|sat\.?\s*fat)\s+\d", re.IGNORECASE)
_INCOMPLETE_NAMES = {
    "ingredient list",
    "ingredients",
    "incomplete ingredient list",
}


def fsa_band(value, low: float, high: float) -> str | None:
    """Return green, amber, or red for a per-100 g value. Missing values score nothing."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value > high:
        return "red"
    if value > low:
        return "amber"
    return "green"


def format_amount(value) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return str(value)
    rounded = round(float(value), 2)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:g}"


def friendly_condition(name: str) -> str:
    key = str(name or "").strip().lower().replace(" ", "_")
    return _FRIENDLY_CONDITION.get(key, key.replace("_", " ") or "a saved condition")


def fsa_phrase(spec: dict, value, band: str) -> str:
    amount = format_amount(value)
    verb = spec["verb"]
    label = spec["label"]
    unit = spec["unit"]
    low = format_amount(spec["low"])
    high = format_amount(spec["high"])
    if band == "red":
        return (
            f"{label} {verb} {amount} {unit}, over the UK front-of-pack high line "
            f"of {high} {unit}"
        )
    if band == "amber":
        return (
            f"{label} {verb} {amount} {unit}, in the UK front-of-pack medium band "
            f"(over {low} and at most {high} {unit})"
        )
    return (
        f"{label} {verb} {amount} {unit}, at or under the UK front-of-pack low line "
        f"of {low} {unit}"
    )


def nutrition_flag_copy(key: str, value, band: str, condition: str) -> tuple[str, str, str]:
    """Shopper-facing flag text for one amber or red nutrient. Same cut-offs as the score."""
    spec = FSA_NUTRIENTS[key]
    # The amount stays in the definition. The chip name is the nutrient, not "Sugars 17.45 g/100g".
    name = spec["flag_name"]
    level = "high" if band == "red" else "medium"
    phrase = fsa_phrase(spec, value, band)
    who = friendly_condition(condition)
    reason = f"{spec['label']} {spec['verb']} {level} on the UK front-of-pack scale for {who}."
    plain = f"{phrase}. That matters for {who}."
    return name, reason, plain


def _clean_name(value) -> str:
    text = str(value or "").lower().replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _is_nutrition_line(item: dict) -> bool:
    """True for a nutrition-panel flag, not for an ingredient such as sodium caseinate."""
    if item.get("panel"):
        return True
    return bool(_NUTRITION_LINE.match(str(item.get("ingredient") or "").strip()))


def _is_incomplete_line(item: dict) -> bool:
    return _clean_name(item.get("ingredient")) in _INCOMPLETE_NAMES


def _band_from_flags(flags: list) -> str:
    if not flags:
        return "caution"
    statuses = {str(item.get("status") or "").lower() for item in flags}
    if "avoid" in statuses:
        return "avoid"
    if "caution" in statuses:
        return "caution"
    return "safe"


def _relevant_nutrients(active: set[str], nutrition: dict) -> list[dict]:
    rows = []
    for key, spec in FSA_NUTRIENTS.items():
        owners = [name for name in spec["conditions"] if name in active]
        if not owners:
            continue
        value = nutrition.get(key)
        band = fsa_band(value, spec["low"], spec["high"])
        if band is None:
            continue
        rows.append(
            {
                "key": key,
                "spec": spec,
                "value": value,
                "band": band,
                "owners": owners,
            }
        )
    return rows


def _worst_band(rows: list[dict]) -> str:
    worst = "none"
    for row in rows:
        if _BAND_RANK[row["band"]] > _BAND_RANK[worst]:
            worst = row["band"]
    return worst


def _cap(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]


def _line(code: str, label: str, detail: str, points: int | None = None) -> dict:
    row = {"code": code, "label": label, "detail": detail}
    if points is not None:
        row["points"] = int(points)
    return row


def _join_names(names: list[str], limit: int = 3) -> str:
    shown = [name for name in names if name][:limit]
    extra = len(names) - len(shown)
    if not shown:
        return "an ingredient"
    text = ", ".join(shown)
    if extra > 0:
        text += f", and {extra} more"
    return text


def _formula(anchor: int, deductions: list[int], score: int, *, held: bool = False) -> str:
    if not deductions and not held:
        return str(score)
    parts = [str(anchor)]
    parts.extend(f"− {amount}" for amount in deductions if amount)
    body = " ".join(parts)
    if held:
        return f"{body} = {anchor - sum(deductions)}, held at {score}"
    return f"{body} = {score}"


def _result(
    *,
    score: int,
    band: str,
    summary: str,
    formula: str,
    lines: list[dict],
    clamped: bool = False,
) -> dict:
    return {
        "score": int(score),
        "band": band,
        "system": SYSTEM_ID,
        "summary": summary,
        "formula": formula,
        "lines": lines,
        "clamped": clamped,
    }


def build_safety_score(
    flags: list | None,
    *,
    conditions: list | None = None,
    nutrition: dict | None = None,
) -> dict:
    """
    Rebuild the 0–100 score from flags and nutrients.

    The returned ``summary``, ``formula``, and ``lines`` are the only
    explanation of the number. They are deterministic.
    """
    from ai.condition_engine import normalize_conditions

    flags = [item for item in (flags or []) if isinstance(item, dict)]
    nutrition = nutrition or {}
    active = normalize_conditions(conditions)
    band = _band_from_flags(flags)
    nutrients = _relevant_nutrients(active, nutrition)

    avoid_items = [
        item
        for item in flags
        if str(item.get("status") or "").lower() == "avoid" and not _is_nutrition_line(item)
    ]
    condition_items = []
    trace_items = []
    unknown_items = []
    incomplete = not flags
    for item in flags:
        status = str(item.get("status") or "").lower()
        if status != "caution" or _is_nutrition_line(item):
            continue
        if _is_incomplete_line(item):
            incomplete = True
            continue
        condition_name = str(item.get("condition") or item.get("matched_category") or "").strip().lower()
        if condition_name in active:
            condition_items.append(item)
            continue
        if item.get("declaration") == "trace":
            trace_items.append(item)
            continue
        unknown_items.append(item)

    hit_conditions: set[str] = set()
    for item in condition_items:
        name = str(item.get("condition") or item.get("matched_category") or "").strip().lower()
        if name in active:
            hit_conditions.add(name)
    for row in nutrients:
        if row["band"] in {"amber", "red"}:
            hit_conditions.update(row["owners"])

    if band == "avoid" or avoid_items:
        return _avoid_score(avoid_items, unknown_items, nutrients)
    if hit_conditions:
        return _condition_score(condition_items, unknown_items, nutrients, hit_conditions, trace_items)
    if trace_items:
        return _trace_score(trace_items, unknown_items)
    if unknown_items:
        return _unknown_score(unknown_items)
    if incomplete or band == "caution":
        return _incomplete_score()
    return _safe_score(flags)


def _avoid_score(avoid_items: list[dict], unknown_items: list[dict], nutrients: list[dict]) -> dict:
    names = [str(item.get("ingredient") or "an ingredient").strip() for item in avoid_items] or ["a saved restriction"]
    extra_hits = max(0, len(avoid_items) - 1) * AVOID_EXTRA_HIT
    reds = [row for row in nutrients if row["band"] == "red"]
    ambers = [row for row in nutrients if row["band"] == "amber"]
    nutrient_points = min(8, len(reds) * AVOID_RED + len(ambers) * AVOID_AMBER)
    unknown_points = min(AVOID_UNKNOWN_CAP, len(unknown_items))
    deductions = [amount for amount in (extra_hits, nutrient_points, unknown_points) if amount]
    raw = AVOID_ANCHOR - sum(deductions)
    score = max(0, min(AVOID_MAX, raw))
    held = raw < 0
    lines = [
        _line(
            "avoid_anchor",
            "Confirmed match",
            (
                f"{_join_names(names)} matched an allergy or restriction you saved. "
                f"One confirmed match starts at {AVOID_ANCHOR}, inside Avoid (0–{AVOID_MAX})."
            ),
            AVOID_ANCHOR,
        )
    ]
    if extra_hits:
        lines.append(
            _line(
                "avoid_extra",
                "Further confirmed matches",
                (
                    f"{len(avoid_items) - 1} more confirmed match"
                    f"{'es' if len(avoid_items) > 2 else ''} "
                    f"{'each take' if len(avoid_items) > 2 else 'takes'} off {AVOID_EXTRA_HIT} points."
                ),
                -extra_hits,
            )
        )
    if nutrient_points:
        phrases = [fsa_phrase(row["spec"], row["value"], row["band"]) for row in (reds + ambers)]
        lines.append(
            _line(
                "nutrient",
                "Nutrient band",
                f"{'; '.join(phrases)}. That takes off {nutrient_points} points while the product is already Avoid.",
                -nutrient_points,
            )
        )
    if unknown_points:
        lines.append(
            _line(
                "unknown",
                "Unidentified ingredient",
                (
                    f"{len(unknown_items)} ingredient"
                    f"{'s' if len(unknown_items) != 1 else ''} could not be identified, "
                    f"so the score drops by {unknown_points}. Unknown items are not extra allergen hits."
                ),
                -unknown_points,
            )
        )
    if held:
        lines.append(
            _line(
                "floor",
                "Avoid floor",
                "The score stops at 0. Further matches do not push it below the scale.",
                None,
            )
        )
    formula = _formula(AVOID_ANCHOR, deductions, score, held=held)
    summary = (
        f"{score} because {_join_names(names)} matched an allergy or restriction you saved. "
        f"Formula: {formula}."
    )
    return _result(score=score, band="avoid", summary=summary, formula=formula, lines=lines)


def _trace_points(trace_items: list[dict]) -> int:
    if not trace_items:
        return 0
    return TRACE_EXTRA * len(trace_items)


def _trace_line(trace_items: list[dict], points: int) -> dict:
    names = [str(item.get("ingredient") or "an allergen").strip() for item in trace_items]
    return _line(
        "trace",
        "May contain",
        (
            f"The label says this may contain {_join_names(names)}, which you asked Scanity to watch for. "
            f"That takes off {points} points. A may-contain line is not a confirmed ingredient."
        ),
        -points,
    )


def _trace_score(trace_items: list[dict], unknown_items: list[dict]) -> dict:
    names = [str(item.get("ingredient") or "an allergen").strip() for item in trace_items]
    extra = max(0, len(trace_items) - 1) * TRACE_EXTRA
    unknown_points = min(CONDITION_UNKNOWN_CAP, len(unknown_items))
    deductions = [amount for amount in (extra, unknown_points) if amount]
    raw = TRACE_ANCHOR - sum(deductions)
    score = max(TRACE_FLOOR, min(69, raw))
    held = raw < TRACE_FLOOR
    lines = [
        _line(
            "trace_anchor",
            "May contain",
            (
                f"The label says this may contain {_join_names(names)}, which you asked Scanity to watch for. "
                f"One may-contain match starts at {TRACE_ANCHOR}, inside Caution. "
                "It is not counted as a confirmed ingredient."
            ),
            TRACE_ANCHOR,
        )
    ]
    if extra:
        lines.append(
            _line(
                "trace_extra",
                "Further may-contain lines",
                f"{len(trace_items) - 1} more may-contain match{'es' if len(trace_items) > 2 else ''} take off {extra} points.",
                -extra,
            )
        )
    if unknown_points:
        lines.append(
            _line(
                "unknown",
                "Unidentified ingredient",
                (
                    f"{len(unknown_items)} ingredient"
                    f"{'s' if len(unknown_items) != 1 else ''} could not be identified, "
                    f"so the score drops by {unknown_points}."
                ),
                -unknown_points,
            )
        )
    if held:
        lines.append(
            _line(
                "floor",
                "Caution floor",
                f"The Caution floor is {TRACE_FLOOR}, so a may-contain line cannot by itself become Avoid.",
                None,
            )
        )
    formula = _formula(TRACE_ANCHOR, deductions, score, held=held)
    summary = (
        f"{score} because the label says this may contain {_join_names(names)}. Formula: {formula}."
    )
    return _result(score=score, band="caution", summary=summary, formula=formula, lines=lines)


def _condition_score(
    condition_items: list[dict],
    unknown_items: list[dict],
    nutrients: list[dict],
    hit_conditions: set[str],
    trace_items: list[dict] | None = None,
) -> dict:
    worst = _worst_band([row for row in nutrients if row["band"] in {"amber", "red", "green"}])
    # A green panel only explains a word hit. It does not create one.
    if worst == "green" and not condition_items:
        worst = "none"
    green_rows = [row for row in nutrients if row["band"] == "green"] if worst in {"none", "green"} else []
    anchor = CONDITION_ANCHOR.get(worst, CONDITION_ANCHOR["none"])
    ranked_rows = sorted(
        [row for row in nutrients if row["band"] == worst and worst in {"amber", "red"}],
        key=lambda row: row["key"],
    )
    owners = []
    for row in ranked_rows:
        for name in row["owners"]:
            if name in hit_conditions and name not in owners:
                owners.append(name)
    if not owners:
        owners = sorted(hit_conditions, key=friendly_condition)
    primary = owners[0]
    extras = [name for name in sorted(hit_conditions, key=friendly_condition) if name != primary]
    extra_points = len(extras) * CONDITION_EXTRA
    unknown_points = min(CONDITION_UNKNOWN_CAP, len(unknown_items))
    trace_points = _trace_points(trace_items or [])
    deductions = [amount for amount in (extra_points, trace_points, unknown_points) if amount]
    raw = anchor - sum(deductions)
    score = max(CONDITION_FLOOR, min(69, raw))
    held = raw < CONDITION_FLOOR

    trigger_names = [
        str(item.get("ingredient") or "").strip()
        for item in condition_items
        if str(item.get("condition") or item.get("matched_category") or "").lower() == primary
    ]
    trigger_names = [name for name in trigger_names if name]
    who = friendly_condition(primary)
    who_label = _cap(who)
    if ranked_rows:
        nutrient_text = "; ".join(fsa_phrase(row["spec"], row["value"], row["band"]) for row in ranked_rows)
        if trigger_names:
            detail = (
                f"{who_label} applies, including {_join_names(trigger_names)}. "
                f"{nutrient_text}. That sets the Caution score at {anchor}."
            )
        else:
            detail = f"{who_label} applies. {nutrient_text}. That sets the Caution score at {anchor}."
    elif green_rows and trigger_names:
        nutrient_text = "; ".join(fsa_phrase(row["spec"], row["value"], row["band"]) for row in green_rows)
        detail = (
            f"{who_label} applies because {_join_names(trigger_names)} shows up on the label. "
            f"{nutrient_text}, so this stays at the mild Caution score of {anchor}."
        )
    elif trigger_names:
        detail = (
            f"{who_label} applies because {_join_names(trigger_names)} shows up on the label. "
            f"The matching nutrient was not in a medium or high UK front-of-pack band, "
            f"so this stays at the mild Caution score of {anchor}."
        )
    else:
        detail = (
            f"{who_label} applies from the nutrients on this label. "
            f"That sets the Caution score at {anchor}."
        )

    lines = [_line("condition_anchor", who_label, detail, anchor)]
    if extra_points:
        extra_labels = [_cap(friendly_condition(name)) for name in extras]
        if len(extra_labels) == 1:
            extra_sentence = f"{extra_labels[0]} also applies, so the score drops by {extra_points}."
        else:
            extra_sentence = f"{', '.join(extra_labels)} also apply, so the score drops by {extra_points}."
        lines.append(
            _line(
                "condition_extra",
                "Another saved condition",
                extra_sentence,
                -extra_points,
            )
        )
    if trace_points:
        lines.append(_trace_line(trace_items or [], trace_points))
    if unknown_points:
        lines.append(
            _line(
                "unknown",
                "Unidentified ingredient",
                (
                    f"{len(unknown_items)} ingredient"
                    f"{'s' if len(unknown_items) != 1 else ''} could not be identified, "
                    f"so the score drops by {unknown_points}."
                ),
                -unknown_points,
            )
        )
    if held:
        lines.append(
            _line(
                "floor",
                "Caution floor",
                (
                    f"The Caution floor is {CONDITION_FLOOR}, so this does not drop into Avoid "
                    "without a confirmed avoid match."
                ),
                None,
            )
        )
    formula = _formula(anchor, deductions, score, held=held)
    summary = f"{score} because {who} applies to this label. Formula: {formula}."
    return _result(score=score, band="caution", summary=summary, formula=formula, lines=lines)


def _unknown_score(unknown_items: list[dict]) -> dict:
    count = max(1, len(unknown_items))
    step_count = count - 1
    step_points = step_count * UNKNOWN_STEP
    raw = UNKNOWN_ANCHOR - step_points
    score = max(UNKNOWN_FLOOR, raw)
    held = raw < UNKNOWN_FLOOR
    names = [str(item.get("ingredient") or "an ingredient").strip() for item in unknown_items]
    lines = [
        _line(
            "unknown_anchor",
            "Unidentified ingredient",
            (
                f"{_join_names(names)} could not be identified. One unidentified ingredient "
                f"starts at {UNKNOWN_ANCHOR}, inside Caution ({CAUTION_MIN}–69). "
                "It is not counted as a confirmed allergen."
            ),
            UNKNOWN_ANCHOR,
        )
    ]
    if step_points:
        lines.append(
            _line(
                "unknown_extra",
                "Further unidentified ingredients",
                (
                    f"{step_count} more unidentified ingredient"
                    f"{'s' if step_count != 1 else ''} "
                    f"{'each take' if step_count != 1 else 'takes'} off {UNKNOWN_STEP} points."
                ),
                -step_points,
            )
        )
    if held:
        lines.append(
            _line(
                "floor",
                "Unknown floor",
                (
                    f"Unidentified ingredients stop at {UNKNOWN_FLOOR}. "
                    "They cannot move the product into Avoid."
                ),
                None,
            )
        )
    deductions = [step_points] if step_points else []
    formula = _formula(UNKNOWN_ANCHOR, deductions, score, held=held)
    summary = (
        f"{score} because {count} ingredient{'s' if count != 1 else ''} could not be identified. "
        f"Formula: {formula}."
    )
    return _result(score=score, band="caution", summary=summary, formula=formula, lines=lines)


def _incomplete_score() -> dict:
    detail = (
        f"No complete ingredient list was available to check. A missing list scores "
        f"{INCOMPLETE_ANCHOR}, in Caution, and is not marked Safe."
    )
    lines = [_line("incomplete", "Incomplete label", detail, INCOMPLETE_ANCHOR)]
    summary = (
        f"{INCOMPLETE_ANCHOR} because this product has no complete ingredient list to check. "
        f"Formula: {INCOMPLETE_ANCHOR}."
    )
    return _result(
        score=INCOMPLETE_ANCHOR,
        band="caution",
        summary=summary,
        formula=str(INCOMPLETE_ANCHOR),
        lines=lines,
    )


def _safe_score(flags: list[dict]) -> dict:
    count = len(flags)
    if count == 1:
        detail = (
            "The listed ingredient was identified, and it did not match the allergies "
            "or conditions saved on this account."
        )
    elif count:
        detail = (
            f"All {count} listed ingredients were identified, and none matched the allergies "
            "or conditions saved on this account."
        )
    else:
        detail = "Nothing on this label matched the allergies or conditions saved on this account."
    lines = [_line("safe", "No profile match", detail, SAFE_SCORE)]
    summary = f"{SAFE_SCORE} because this label did not match the allergies or conditions you saved. Formula: {SAFE_SCORE}."
    return _result(
        score=SAFE_SCORE,
        band="safe",
        summary=summary,
        formula=str(SAFE_SCORE),
        lines=lines,
    )
