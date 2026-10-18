"""
Phase 7 — Risk tier classification.

Covers:
  - All four rules from Appendix E.
  - Boundary at 49/50 and 79/80.
  - MATCH short-circuits regardless of score.
  - FLAGGED yields MEDIUM even at low scores.
  - classify_risk writes a RiskClassification row.
  - Rules are deterministic and use Decimal arithmetic.
"""

from datetime import date
from decimal import Decimal

import pytest

from backend.ocr_engine.models import OCRResult
from backend.risk.models import EvidenceScore, RiskClassification
from backend.risk.tasks import classify_risk, classify_risk_tier
from backend.screening.models import ScreeningResult
from backend.verification.models import ParsedDocument


# --- pure function: classify_risk_tier ------------------------------------

def test_match_forces_high_ignoring_score():
    tier, reasons = classify_risk_tier(Decimal("100"), "MATCH")
    assert tier == "HIGH"
    assert any("MATCH" in r for r in reasons)


def test_match_with_low_score_still_high():
    tier, _ = classify_risk_tier(Decimal("10"), "MATCH")
    assert tier == "HIGH"


def test_high_score_clear_is_low():
    tier, _ = classify_risk_tier(Decimal("100"), "CLEAR")
    assert tier == "LOW"


def test_boundary_80_clear_is_low():
    tier, _ = classify_risk_tier(Decimal("80"), "CLEAR")
    assert tier == "LOW"


def test_boundary_79_clear_is_medium():
    tier, _ = classify_risk_tier(Decimal("79"), "CLEAR")
    assert tier == "MEDIUM"


def test_boundary_50_clear_is_medium():
    tier, _ = classify_risk_tier(Decimal("50"), "CLEAR")
    assert tier == "MEDIUM"


def test_boundary_49_clear_is_high():
    tier, _ = classify_risk_tier(Decimal("49"), "CLEAR")
    assert tier == "HIGH"


def test_flagged_overrides_low_score_to_medium():
    """Rule 3 fires before rule 4: FLAGGED at score 10 -> MEDIUM."""
    tier, _ = classify_risk_tier(Decimal("10"), "FLAGGED")
    assert tier == "MEDIUM"


def test_flagged_with_high_score_is_medium():
    """Not MATCH, not CLEAR: 100 + FLAGGED -> MEDIUM (rule 3)."""
    tier, _ = classify_risk_tier(Decimal("100"), "FLAGGED")
    assert tier == "MEDIUM"


@pytest.mark.parametrize("score,screening,expected", [
    ("100", "MATCH", "HIGH"),
    ("0",   "MATCH", "HIGH"),
    ("100", "CLEAR", "LOW"),
    ("80",  "CLEAR", "LOW"),
    ("79",  "CLEAR", "MEDIUM"),
    ("50",  "CLEAR", "MEDIUM"),
    ("49",  "CLEAR", "HIGH"),
    ("0",   "CLEAR", "HIGH"),
    ("100", "FLAGGED", "MEDIUM"),
    ("50",  "FLAGGED", "MEDIUM"),
    ("10",  "FLAGGED", "MEDIUM"),
])
def test_rule_matrix(score, screening, expected):
    tier, _ = classify_risk_tier(Decimal(score), screening)
    assert tier == expected, f"score={score} screening={screening}"


def test_reasons_is_nonempty_list():
    tier, reasons = classify_risk_tier(Decimal("100"), "CLEAR")
    assert isinstance(reasons, list)
    assert len(reasons) >= 1
    assert all(isinstance(r, str) for r in reasons)


# --- integration: classify_risk ------------------------------------------

def _make_chain(document, score, screening_status):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text="dummy",
        confidence=Decimal("90.00"),
    )
    parsed = ParsedDocument.objects.create(
        ocr_result=ocr,
        doc_type="national_id",
        id_number="63-1234567A78",
        name="JOHN DOE",
    )
    EvidenceScore.objects.create(
        parsed_document=parsed,
        score=Decimal(score),
        breakdown={},
    )
    ScreeningResult.objects.create(
        parsed_document=parsed,
        status=screening_status,
        details={},
    )
    return parsed


@pytest.mark.django_db
def test_classify_risk_writes_row_low(document):
    parsed = _make_chain(document, "95", "CLEAR")
    rc_id = classify_risk(parsed.id)
    rc = RiskClassification.objects.get(id=rc_id)
    assert rc.parsed_document_id == parsed.id
    assert rc.tier == "LOW"
    assert isinstance(rc.reason, list)


@pytest.mark.django_db
def test_classify_risk_writes_row_high(document):
    parsed = _make_chain(document, "30", "CLEAR")
    rc_id = classify_risk(parsed.id)
    assert RiskClassification.objects.get(id=rc_id).tier == "HIGH"


@pytest.mark.django_db
def test_classify_risk_match_overrides(document):
    parsed = _make_chain(document, "100", "MATCH")
    rc_id = classify_risk(parsed.id)
    assert RiskClassification.objects.get(id=rc_id).tier == "HIGH"


@pytest.mark.django_db
def test_classify_risk_is_idempotent(document):
    parsed = _make_chain(document, "75", "CLEAR")
    first = classify_risk(parsed.id)
    second = classify_risk(parsed.id)
    assert first == second
    assert RiskClassification.objects.filter(parsed_document=parsed).count() == 1
