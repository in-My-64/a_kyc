"""Maps a CardResult onto your ParsedDocument row. Returns the issue codes to store."""
from __future__ import annotations

from datetime import datetime

from .types import CardResult


def _d(s: str | None):
    return datetime.strptime(s, "%d/%m/%Y").date() if s else None


def apply_to_parsed(parsed, result: CardResult) -> list[str]:
    f = result.fields
    val = lambda n: f[n].value if n in f else None  # noqa: E731
    issues = list(result.issues)
    for fr in f.values():
        issues.extend(fr.issues)

    parsed.id_number = val("id_number")
    if parsed.id_number:
        parsed.doc_type = "national_id"
        parsed.nationality = "ZW"
        issues.append("nationality_inferred_from_doc_type")
    else:
        parsed.nationality = None

    parsed.name = " ".join(
        p for p in (val("first_name"), val("surname")) if p
    ) or None
    parsed.dob = _d(val("dob"))
    parsed.expiry = None  # this card type has no expiry; don't penalise it in scoring

    # Preserve any other correction keys the pipeline has already written
    # (e.g. assessment_360_snapshot on re-runs). SuperOCR only owns the
    # two keys it writes below.
    corrections = dict(parsed.corrections or {})

    corrections["superocr"] = {
        n: {
            "agreement": round(x.agreement, 2),
            "confidence": round(x.confidence, 2),
            "votes": x.votes,
            "engines": x.engines,
            "source": x.source,
        }
        for n, x in f.items()
    }

    # Raw per-field values, in their original key names (first_name and
    # surname kept separate). The compare_extractions step reads this so
    # it can score SuperOCR against v1 and the VLM without re-running
    # the pipeline. `superocr` above is diagnostics; `superocr_raw` is
    # the machine-readable extraction.
    corrections["superocr_raw"] = {
        "id_number": val("id_number"),
        "surname": val("surname"),
        "first_name": val("first_name"),
        "dob": val("dob"),
        "village_of_origin": val("village_of_origin"),
        "place_of_birth": val("place_of_birth"),
        "date_of_issue": val("date_of_issue"),
    }

    parsed.corrections = corrections
    return issues