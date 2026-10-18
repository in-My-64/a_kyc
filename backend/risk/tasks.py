# backend/risk/tasks.py
import logging
import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from celery import shared_task
from django.db import InterfaceError, OperationalError

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.ocr_engine.models import OCRResult
from backend.screening.models import ScreeningResult
from backend.verification.constants import PATTERNS
from backend.verification.models import ParsedDocument

from .models import EvidenceScore, RiskClassification

logger = logging.getLogger(__name__)

_TRANSIENT = (OSError, OperationalError, InterfaceError)


# ---------------------------------------------------------------------------
# Weight tables
#
# One table per document type. Every table MUST sum to 100. Fields not
# present in a table are not scored for that document type — the
# evidence table renders only the rows the table defines.
#
# national_id has no `expiry` because Zimbabwe national registration
# cards are issued without one. The 10 points that would go to expiry
# are redistributed proportionally across the fields that do exist, so
# the national_id score is still out of 100.
# ---------------------------------------------------------------------------

_WEIGHTS_BY_DOC_TYPE: dict[str, dict[str, int]] = {
    "national_id": {
        "id_number": 22,
        "name": 17,
        "dob": 11,
        "nationality": 6,
        "ocr_confidence": 33,
        "ocr_word_count": 11,
    },
    "passport": {
        "id_number": 20,
        "name": 15,
        "dob": 10,
        "expiry": 10,
        "nationality": 5,
        "ocr_confidence": 30,
        "ocr_word_count": 10,
    },
    "licence": {
        "id_number": 20,
        "name": 15,
        "dob": 10,
        "expiry": 10,
        "nationality": 5,
        "ocr_confidence": 30,
        "ocr_word_count": 10,
    },
}

# Fallback when doc_type is unknown or unmapped. Same as passport —
# any document with an expiry gets the full seven-field scoring.
_DEFAULT_WEIGHTS = _WEIGHTS_BY_DOC_TYPE["passport"]


def _weights_for(doc_type: str | None) -> dict[str, int]:
    return _WEIGHTS_BY_DOC_TYPE.get(doc_type or "", _DEFAULT_WEIGHTS)


def _valid_id(id_number, doc_type):
    if not id_number or doc_type not in PATTERNS:
        return False
    return bool(re.fullmatch(PATTERNS[doc_type], id_number))


def compute_score(parsed):
    """
    Weighted evidence score for one parsed document.

    The set of scored fields and their weights depends on
    `parsed.doc_type`. Every table in `_WEIGHTS_BY_DOC_TYPE` sums to
    100, so every score is out of 100 regardless of document type.

    Every breakdown entry carries both the points awarded and the
    field's weight, so the frontend can render a Weight / Score /
    Weighted table without recomputing anything.
    """
    weights = _weights_for(parsed.doc_type)
    score = Decimal("0")
    breakdown: dict[str, dict] = {}

    # --- id_number ----------------------------------------------------
    if "id_number" in weights:
        w = weights["id_number"]
        if _valid_id(parsed.id_number, parsed.doc_type):
            pts, reason = w, "regex-valid"
        elif parsed.id_number:
            pts, reason = w // 2, "present but not regex-valid"
        else:
            pts, reason = 0, "missing or invalid"
        score += Decimal(pts)
        breakdown["id_number"] = {
            "points": pts, "weight": w, "reason": reason,
        }

    # --- name ---------------------------------------------------------
    if "name" in weights:
        w = weights["name"]
        if parsed.name and len(parsed.name.split()) >= 2:
            pts, reason = w, "2+ tokens"
        elif parsed.name:
            pts, reason = max(1, w // 2), "single token"
        else:
            pts, reason = 0, "missing"
        score += Decimal(pts)
        breakdown["name"] = {
            "points": pts, "weight": w, "reason": reason,
        }

    # --- dob ----------------------------------------------------------
    if "dob" in weights:
        w = weights["dob"]
        if parsed.dob:
            pts, reason = w, "present"
        else:
            pts, reason = 0, "missing"
        score += Decimal(pts)
        breakdown["dob"] = {
            "points": pts, "weight": w, "reason": reason,
        }

    # --- expiry -------------------------------------------------------
    # Skipped entirely for document types without an expiry field.
    if "expiry" in weights:
        w = weights["expiry"]
        if parsed.expiry and parsed.expiry >= date.today():
            pts, reason = w, "in future"
        elif parsed.expiry:
            pts, reason = 0, "expired"
        else:
            pts, reason = 0, "missing"
        score += Decimal(pts)
        breakdown["expiry"] = {
            "points": pts, "weight": w, "reason": reason,
        }

    # --- nationality --------------------------------------------------
    if "nationality" in weights:
        w = weights["nationality"]
        if parsed.nationality:
            pts, reason = w, "present"
        else:
            pts, reason = 0, "missing"
        score += Decimal(pts)
        breakdown["nationality"] = {
            "points": pts, "weight": w, "reason": reason,
        }

    # --- OCR confidence + word count ----------------------------------
    # Both are read from OCRResult once and reused for the two buckets.
    try:
        ocr = parsed.ocr_result
        conf = float(ocr.confidence or 0)
        words = len((ocr.extracted_text or "").split())
    except OCRResult.DoesNotExist:
        conf, words = 0.0, 0

    if "ocr_confidence" in weights:
        w = weights["ocr_confidence"]
        if conf >= 90:
            pct = 1.0
        elif conf >= 70:
            pct = 2 / 3
        elif conf >= 50:
            pct = 1 / 3
        else:
            pct = 0.0
        pts = round(w * pct)
        score += Decimal(pts)
        breakdown["ocr_confidence"] = {
            "points": pts,
            "weight": w,
            "reason": f"confidence={round(conf, 2)}",
            "value": round(conf, 2),
        }

    if "ocr_word_count" in weights:
        w = weights["ocr_word_count"]
        if words >= 20:
            pct = 1.0
        elif words >= 5:
            pct = 0.5
        else:
            pct = 0.0
        pts = round(w * pct)
        score += Decimal(pts)
        breakdown["ocr_word_count"] = {
            "points": pts,
            "weight": w,
            "reason": f"words={words}",
            "value": words,
        }

    return score.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), breakdown


def classify_risk_tier(score, screening_status):
    score = Decimal(score)

    if screening_status == "TAMPERED":
        return "HIGH", [f"screening=TAMPERED (score={score})"]

    if screening_status == "MATCH":
        return "HIGH", [f"screening=MATCH overrides evidence (score={score})"]

    if score < Decimal("50"):
        return "HIGH", [f"score<50 (score={score})"]

    if Decimal("50") <= score <= Decimal("79"):
        return "MEDIUM", [f"50<=score<=79 (score={score})"]

    if screening_status == "FLAGGED":
        return "MEDIUM", [f"score>=80 but screening=FLAGGED (score={score})"]

    if screening_status == "CLEAR":
        return "LOW", ["score>=80 and screening=CLEAR"]

    return "HIGH", [
        f"score>=80 but screening={screening_status!r} is not a recognised "
        f"status — defaulting to HIGH pending manual review"
    ]


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def compute_evidence_score(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "compute_evidence_score", self.request.id)

    try:
        parsed = ParsedDocument.objects.get(id=parsed_doc_id)
    except ParsedDocument.DoesNotExist as exc:
        raise ValueError(
            f"ParsedDocument {parsed_doc_id} does not exist"
        ) from exc

    score, breakdown = compute_score(parsed)
    EvidenceScore.objects.update_or_create(
        parsed_document=parsed,
        defaults={"score": score, "breakdown": breakdown},
    )
    return parsed_doc_id


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def classify_risk(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "classify_risk", self.request.id)

    try:
        parsed = ParsedDocument.objects.get(id=parsed_doc_id)
    except ParsedDocument.DoesNotExist as exc:
        raise ValueError(
            f"ParsedDocument {parsed_doc_id} does not exist"
        ) from exc

    try:
        evidence = EvidenceScore.objects.get(parsed_document=parsed)
    except EvidenceScore.DoesNotExist as exc:
        raise ValueError(
            f"EvidenceScore missing for parsed document {parsed_doc_id}"
        ) from exc


    try:
        screening = ScreeningResult.objects.get(parsed_document=parsed)
        screening_status = screening.status
    except ScreeningResult.DoesNotExist:
        screening_status = "CLEAR"

    tier, reasons = classify_risk_tier(evidence.score, screening_status)


    RiskClassification.objects.update_or_create(
        parsed_document=parsed,
        defaults={"tier": tier, "reason": reasons},
    )

    return parsed_doc_id