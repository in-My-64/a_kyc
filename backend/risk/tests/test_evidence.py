"""
Phase 5 — Evidence score.

Covers:
  - Perfect document -> 100.
  - Expired expiry loses the 10 points.
  - OCR confidence bands (>=90, >=70, >=50, <50).
  - Word-count bands (>=20, >=5, <5).
  - Invalid id_number loses 20 points.
  - compute_evidence_score writes an EvidenceScore row.
"""

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from backend.ocr_engine.models import OCRResult
from backend.risk.models import EvidenceScore
from backend.risk.tasks import compute_evidence_score, compute_score
from backend.verification.models import ParsedDocument


# --- pure function: compute_score -----------------------------------------

def _fake_parsed(
    id_number="63-1234567A78",
    doc_type="national_id",
    name="JOHN DOE",
    dob=date(1990, 1, 15),
    expiry=None,
    nationality="ZW",
    ocr_confidence=Decimal("95.00"),
    ocr_text="a b c d e f g h i j k l m n o p q r s t",  # 20 words
):
    """Build a plain object shaped like a ParsedDocument + nested OCRResult."""
    if expiry is None:
        expiry = date.today() + timedelta(days=365)
    ocr = SimpleNamespace(
        confidence=ocr_confidence,
        extracted_text=ocr_text,
    )
    return SimpleNamespace(
        id_number=id_number,
        doc_type=doc_type,
        name=name,
        dob=dob,
        expiry=expiry,
        nationality=nationality,
        ocr_result=ocr,
    )


def test_perfect_document_scores_100():
    score, breakdown = compute_score(_fake_parsed())
    assert score == Decimal("100.00")
    assert breakdown["id_number"]["points"] == 20
    assert breakdown["name"]["points"] == 15
    assert breakdown["dob"]["points"] == 10
    assert breakdown["expiry"]["points"] == 10
    assert breakdown["nationality"]["points"] == 5
    assert breakdown["ocr_confidence"]["points"] == 30
    assert breakdown["ocr_word_count"]["points"] == 10


def test_expired_id_loses_10():
    expired = date.today() - timedelta(days=1)
    score, breakdown = compute_score(_fake_parsed(expiry=expired))
    assert score == Decimal("90.00")
    assert breakdown["expiry"]["points"] == 0
    assert breakdown["expiry"]["reason"] == "expired"


def test_missing_id_loses_20():
    score, breakdown = compute_score(_fake_parsed(id_number=None))
    assert score == Decimal("80.00")
    assert breakdown["id_number"]["points"] == 0


def test_invalid_id_loses_20():
    score, _ = compute_score(_fake_parsed(id_number="not-an-id"))
    assert score == Decimal("80.00")


def test_single_token_name_loses_15():
    score, breakdown = compute_score(_fake_parsed(name="JOHN"))
    assert score == Decimal("85.00")
    assert breakdown["name"]["points"] == 0


@pytest.mark.parametrize("conf,expected_points", [
    (95, 30),
    (90, 30),
    (89.9, 20),
    (70, 20),
    (69.9, 10),
    (50, 10),
    (49.9, 0),
    (0, 0),
])
def test_ocr_confidence_bands(conf, expected_points):
    score, breakdown = compute_score(_fake_parsed(ocr_confidence=Decimal(str(conf))))
    assert breakdown["ocr_confidence"]["points"] == expected_points


@pytest.mark.parametrize("words,expected_points", [
    (25, 10),
    (20, 10),
    (19, 5),
    (5, 5),
    (4, 0),
    (0, 0),
])
def test_ocr_word_count_bands(words, expected_points):
    text = " ".join(["w"] * words)
    score, breakdown = compute_score(_fake_parsed(ocr_text=text))
    assert breakdown["ocr_word_count"]["points"] == expected_points


def test_missing_nationality_loses_5():
    score, _ = compute_score(_fake_parsed(nationality=None))
    assert score == Decimal("95.00")


def test_all_missing_scores_zero():
    parsed = SimpleNamespace(
        id_number=None, doc_type="unknown", name=None,
        dob=None, expiry=None, nationality=None,
        ocr_result=SimpleNamespace(confidence=None, extracted_text=""),
    )
    score, _ = compute_score(parsed)
    assert score == Decimal("0.00")


# --- integration: compute_evidence_score ----------------------------------

@pytest.mark.django_db
def test_compute_evidence_score_writes_row(document):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text=" ".join(["w"] * 25),
        confidence=Decimal("95.00"),
    )
    parsed = ParsedDocument.objects.create(
        ocr_result=ocr,
        doc_type="national_id",
        id_number="63-1234567A78",
        name="JOHN DOE",
        dob=date(1990, 1, 15),
        expiry=date(2030, 6, 30),
        nationality="ZW",
    )
    ev_id = compute_evidence_score(parsed.id)
    ev = EvidenceScore.objects.get(id=ev_id)
    assert ev.parsed_document_id == parsed.id
    assert ev.score == Decimal("100.00")
    assert ev.breakdown["id_number"]["points"] == 20


@pytest.mark.django_db
def test_evidence_score_is_idempotent(document):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text="ok text here",
        confidence=Decimal("70.00"),
    )
    parsed = ParsedDocument.objects.create(
        ocr_result=ocr, doc_type="unknown",
    )
    first = compute_evidence_score(parsed.id)
    second = compute_evidence_score(parsed.id)
    # update_or_create: same row updated, not a new one
    assert first == second
    assert EvidenceScore.objects.filter(parsed_document=parsed).count() == 1
