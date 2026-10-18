"""
Field specs for the Zimbabwe National Registration card.

Every `normalize_*` function returns a CANONICAL, VALIDATED string or None.
Voting happens on canonical values, so "63-2316316 $ 50" and "632316316S50"
count as the same vote, and anything that can't be a valid value counts as none.

Repairs are position-aware: we know which slots are digits and which is the
letter, so O->0 is applied in digit slots only. No blind global swaps.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Callable, Mapping

DIGIT_FIX = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "Z": "2",
             "S": "5", "$": "5", "§": "5", "G": "6", "T": "7", "B": "8"}
LETTER_FIX = {"0": "O", "1": "I", "5": "S", "$": "S", "§": "S", "8": "B", "2": "Z", "6": "G"}
NAME_FIX = {"0": "O", "1": "I", "5": "S", "8": "B", "$": "S", "§": "S"}
LABEL_WORDS = {"SURNAME", "FIRST", "NAME", "DATE", "BIRTH", "VILLAGE", "ORIGIN",
               "PLACE", "ISSUE", "OF", "ID", "NUMBER"}


# Registration-number body lengths accepted (digits between the 2-digit prefix and the letter).
# Verify against real cards before widening: each extra length loosens the validator.
ID_BODY_LENGTHS = (7, 6)


def _fix(ch: str, kind: str) -> str | None:
    if kind == "D":
        return ch if ch.isdigit() else DIGIT_FIX.get(ch)
    return ch if ch.isalpha() else LETTER_FIX.get(ch)


def normalize_zw_id(raw: str) -> str | None:
    """NN-NNNNNNN L NN (6-digit body accepted). Missing suffix => rejected."""
    s = re.sub(r"[^A-Z0-9$§]", "", raw.upper())
    for body in ID_BODY_LENGTHS:
        if len(s) == 2 + body + 1 + 2:
            kinds = "D" * (2 + body) + "L" + "DD"
            fixed = [_fix(c, k) for c, k in zip(s, kinds)]
            if None in fixed:
                return None
            f = "".join(fixed)
            return f"{f[:2]}-{f[2:2 + body]} {f[2 + body]} {f[-2:]}"
    return None


def normalize_date(raw: str, kind: str) -> str | None:
    """Canonical DD/MM/YYYY. kind: 'dob' (0-120y old) or 'issue' (not in the future)."""
    s = re.sub(r"[^A-Z0-9]", "", raw.upper())   # separators are noise; drop them
    if len(s) != 8:
        return None
    digits = [_fix(c, "D") for c in s]
    if None in digits:
        return None
    try:
        dt = datetime.strptime("".join(digits), "%d%m%Y").date()
    except ValueError:
        return None
    today = date.today()
    if kind == "dob" and not (0 <= (today - dt).days / 365.25 <= 120):
        return None
    if kind == "issue" and dt > today:
        return None
    return dt.strftime("%d/%m/%Y")


def normalize_name(raw: str) -> str | None:
    """
    Upper-case alphabetic tokens, with look-alike digits repaired (0->O, 1->I, ...).

    Anything we cannot repair is grounds for rejection, never silent deletion:
    "M4RY" must not become "RY". A wrong-but-valid-looking value is worse than
    None because it can win a vote.
    """
    up = raw.upper()
    alnum = re.findall(r"[A-Z0-9$§]", up)
    if not alnum or sum(c.isdigit() or c in "$§" for c in alnum) / len(alnum) > 0.25:
        return None  # mostly digits: this is not a name, don't "repair" it into one
    s = "".join(NAME_FIX.get(c, c) for c in up)
    if re.search(r"[0-9$§]", s):
        return None  # a digit with no letter look-alike (2,3,4,6,7,9) survived the repair
    tokens = [t for t in re.findall(r"[A-Z][A-Z'\-]*", s) if len(t) >= 2 and t not in LABEL_WORDS]
    return " ".join(tokens) or None


def _to_date(s: str | None) -> date | None:
    return datetime.strptime(s, "%d/%m/%Y").date() if s else None


def validate_cross_fields(values: Mapping[str, str | None]) -> list[str]:
    """Consistency checks between fields. Returns issue codes; never mutates values."""
    issues: list[str] = []
    dob, issued = _to_date(values.get("dob")), _to_date(values.get("date_of_issue"))
    if dob and issued:
        if issued <= dob:
            issues.append("date_of_issue_not_after_dob")
        elif (issued - dob).days / 365.25 < 16:
            issues.append("issued_before_age_16")  # review flag, not a rejection
    return issues


@dataclass(frozen=True)
class FieldSpec:
    name: str
    normalize: Callable[[str], str | None]
    whitelist: str
    layout: tuple[float, float, float, float]  # fallback box, fractions of the dewarped card
    psm: int = 7                               # Tesseract page-segmentation mode
    min_votes: int = 1                         # critical fields need agreement across reads
    min_engines: int = 1                       # ...and across INDEPENDENT engines, not just variants


# PSM reference (Tesseract):
#   6  — assume a single uniform block of text. Use when a field's box
#        might catch a wrapped line or two.
#   7  — assume a single text line. Best when the box is tight on one row.
#   11 — sparse text: find as much text as possible, ignore structure.
#        Used as a last-resort recovery when PSM 7 yields nothing.
_DIG = "0123456789/.-"
_ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-"
_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-"

# Layout boxes calibrated against a real ZW ID-1 card photographed on a
# table. Fractions are of the dewarped card (1012×638). The value column
# sits at x 0.42-0.78; the ghost photo occupies 0.80-0.96, which is why
# the right edge is 0.78 and not 0.96.
#
# min_engines is 1 on id_number and dob because only Tesseract is
# installed here. Bump to 2 once PaddleOCR is added — the whole point of
# the field is cross-engine confirmation, which needs a second engine.
ZW_NATIONAL_ID: dict[str, FieldSpec] = {s.name: s for s in (
    FieldSpec("id_number", normalize_zw_id, _ALNUM, (0.42, 0.185, 0.80, 0.255),
              psm=7, min_votes=2, min_engines=1),
    FieldSpec("surname", normalize_name, _ALPHA, (0.42, 0.255, 0.78, 0.315),
              psm=7),
    FieldSpec("first_name", normalize_name, _ALPHA, (0.42, 0.325, 0.78, 0.385),
              psm=7),
    FieldSpec("dob", lambda r: normalize_date(r, "dob"), _DIG, (0.42, 0.400, 0.78, 0.460),
              psm=7, min_votes=2, min_engines=1),
    # Village / place boxes are the ones most likely to catch a wrapped
    # line or a sliver of the label above. PSM 6 (block) is more tolerant
    # of that than PSM 7 (single line).
    FieldSpec("village_of_origin", normalize_name, _ALPHA, (0.42, 0.470, 0.78, 0.530),
              psm=6),
    FieldSpec("place_of_birth", normalize_name, _ALPHA, (0.42, 0.540, 0.78, 0.600),
              psm=6),
    FieldSpec("date_of_issue", lambda r: normalize_date(r, "issue"), _DIG, (0.42, 0.610, 0.78, 0.670),
              psm=7),
)}