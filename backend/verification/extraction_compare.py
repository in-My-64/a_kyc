"""
Score every engine's extraction and pick a winner.

Scoring is field-coverage-based, not confidence-based, because the
three engines do not produce comparable confidence values:

  * v1 whole-image OCR → per-word confidence from Tesseract
  * SuperOCR           → aggregated vote confidence across variants
  * VLM                → no confidence at all, only text

What they all agree on is "did we get the field, and is it valid" — so
that's what we score. A field that fails its validator scores zero
regardless of engine confidence.

Winner rule: highest total score. Ties broken by engine tier — VLM
wins over SuperOCR wins over v1 — because when coverage is equal, the
more capable engine is the safer pick.
"""
from __future__ import annotations

import re
from datetime import date, datetime

from .constants import PATTERNS


# Engine precedence for tie-breaking. Higher is better.
_TIER = {"vlm": 3, "superocr": 2, "v1": 1}


def _valid_id(id_number: str | None) -> bool:
    if not id_number:
        return False
    return bool(re.fullmatch(PATTERNS["national_id"], id_number.strip()))


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _plausible_date(d: date | None, kind: str) -> bool:
    if d is None:
        return False
    today = date.today()
    if kind == "dob":
        return 0 <= (today - d).days / 365.25 <= 120
    if kind == "issue":
        return d <= today
    return False


def _has_name(name: str | None) -> bool:
    if not name:
        return False
    tokens = re.findall(r"[A-Za-z]+", name)
    return len(tokens) >= 2


def score_extraction(fields: dict) -> tuple[float, dict]:
    """
    Return (score out of 100, per-field breakdown). Every field's points
    are recorded even when zero so the UI can show exactly what was
    awarded.
    """
    score = 0.0
    breakdown: dict[str, int] = {}

    id_num = fields.get("id_number")
    if _valid_id(id_num):
        score += 30
        breakdown["id_number"] = 30
    elif id_num:
        score += 10
        breakdown["id_number"] = 10
    else:
        breakdown["id_number"] = 0

    name = fields.get("name")
    if _has_name(name):
        score += 20
        breakdown["name"] = 20
    elif name:
        score += 10
        breakdown["name"] = 10
    else:
        breakdown["name"] = 0

    dob = _parse_date(fields.get("dob"))
    if _plausible_date(dob, "dob"):
        score += 15
        breakdown["dob"] = 15
    else:
        breakdown["dob"] = 0

    if fields.get("village_of_origin"):
        score += 10
        breakdown["village_of_origin"] = 10
    else:
        breakdown["village_of_origin"] = 0

    if fields.get("place_of_birth"):
        score += 10
        breakdown["place_of_birth"] = 10
    else:
        breakdown["place_of_birth"] = 0

    issued = _parse_date(fields.get("date_of_issue"))
    if _plausible_date(issued, "issue"):
        score += 10
        breakdown["date_of_issue"] = 10
    else:
        breakdown["date_of_issue"] = 0

    return round(score, 2), breakdown


def pick_winner(
    engine_outputs: dict[str, dict],
) -> tuple[str | None, dict[str, dict]]:
    """
    Score every engine, return (winner_name, per_engine_scores).

    engine_outputs shape:
        {"v1": {...fields...}, "superocr": {...}, "vlm": {...}}

    per_engine_scores shape:
        {"v1": {"score": 55.0, "breakdown": {...}}, ...}
    """
    scored: dict[str, dict] = {}
    for name, fields in engine_outputs.items():
        if not fields:
            scored[name] = {"score": 0.0, "breakdown": {}}
            continue
        s, bd = score_extraction(fields)
        scored[name] = {"score": s, "breakdown": bd}

    if not scored:
        return None, scored

    def sort_key(item):
        name, data = item
        return (data["score"], _TIER.get(name, 0))

    winner, _ = max(scored.items(), key=sort_key)
    if scored[winner]["score"] <= 0:
        return None, scored
    return winner, scored