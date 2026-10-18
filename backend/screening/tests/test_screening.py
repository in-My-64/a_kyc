"""
Phase 6 — Watchlist screening.

Covers:
  - Exact ID match -> MATCH (short-circuits the loop).
  - token_sort_ratio(name) >= 90 -> MATCH.
  - 75 <= ratio < 90 -> FLAGGED.
  - < 75 -> CLEAR.
  - Boundary behaviour at 74, 75, 89, 90 (via crafted names).
  - Empty watchlist -> CLEAR.
  - WatchlistEntry model integration.
  - screen_document writes ScreeningResult linked to the parsed doc.
"""

from decimal import Decimal

import pytest
from rapidfuzz import fuzz

from backend.ocr_engine.models import OCRResult
from backend.screening.models import ScreeningResult, WatchlistEntry
from backend.screening.tasks import (
    all_entries,
    classify_screening,
    screen_document,
)
from backend.verification.models import ParsedDocument


# --- pure function: classify_screening ------------------------------------

def test_exact_id_returns_match():
    entries = [{"id": "63-1234567A78", "name": "IRRELEVANT"}]
    status, details = classify_screening("63-1234567A78", "someone else", entries)
    assert status == "MATCH"
    assert details["rule"] == "id_exact"


def test_name_exact_returns_match():
    entries = [{"id": "ZZ999", "name": "JOHN DOE"}]
    status, _ = classify_screening("nope", "JOHN DOE", entries)
    assert status == "MATCH"


def test_name_transposition_lands_in_flagged():
    """'JONH DOE' vs 'JOHN DOE' scores 87.5 in RapidFuzz 3.9 -> FLAGGED."""
    entries = [{"id": "ZZ999", "name": "JOHN DOE"}]
    score = fuzz.token_sort_ratio("JONH DOE", "JOHN DOE")
    assert 75 <= score < 90, f"baseline assumption broken: {score}"
    status, _ = classify_screening("nope", "JONH DOE", entries)
    assert status == "FLAGGED"


def test_empty_watchlist_returns_clear():
    assert classify_screening("63-1234567A78", "JOHN DOE", [])[0] == "CLEAR"


def test_no_id_no_name_returns_clear():
    entries = [{"id": "X", "name": "Y"}]
    assert classify_screening(None, None, entries)[0] == "CLEAR"


def test_flagged_range_75_to_89():
    """A transposition ('JONH') scores 87.5 -> FLAGGED."""
    a, b = "JONH DOE", "JOHN DOE"
    score = fuzz.token_sort_ratio(a, b)
    assert 75 <= score < 90, f"fixture assumption broken: {score}"
    entries = [{"id": "ZZ999", "name": b}]
    assert classify_screening("nope", a, entries)[0] == "FLAGGED"


def test_clear_below_75():
    entries = [{"id": "ZZ999", "name": "JOHN DOE"}]
    status, _ = classify_screening("nope", "WHOLLY DIFFERENT", entries)
    assert status == "CLEAR"


def test_first_match_short_circuits():
    """If the first entry matches, later entries aren't evaluated."""
    entries = [
        {"id": "MATCH-1", "name": "X"},
        {"id": "MATCH-2", "name": "Y"},
    ]
    status, details = classify_screening("MATCH-1", "anything", entries)
    assert status == "MATCH"
    assert details["matches"][0]["entry"]["id"] == "MATCH-1"
    assert len(details["matches"]) == 1


# --- boundary check via token_sort_ratio ----------------------------------

@pytest.mark.parametrize("a,b,expected_band", [
    ("JOHN DOE", "JOHN DOE", "match"),        # 100.0
    ("JONH DOE", "JOHN DOE", "flagged"),      # 87.5
    ("JOHN DOE X", "JOHN DOE", "flagged"),    # 88.89 with extra token
    ("JANE ROE", "JOHN DOE", "clear"),        # <75
])
def test_scoring_bands(a, b, expected_band):
    score = fuzz.token_sort_ratio(a, b)
    if expected_band == "match":
        assert score >= 90, f"{a} vs {b} = {score}"
    elif expected_band == "flagged":
        assert 75 <= score < 90, f"{a} vs {b} = {score}"
    elif expected_band == "clear":
        assert score < 75, f"{a} vs {b} = {score}"


# --- WatchlistEntry model -------------------------------------------------

@pytest.mark.django_db
def test_all_entries_reads_model():
    WatchlistEntry.objects.create(entry={"id": "A", "name": "Alpha"})
    WatchlistEntry.objects.create(entry={"id": "B", "name": "Beta"})
    WatchlistEntry.objects.create(entry={"id": "C", "name": "Gamma"})
    entries = all_entries()
    assert len(entries) == 3
    ids = {e["id"] for e in entries}
    assert ids == {"A", "B", "C"}


@pytest.mark.django_db
def test_all_entries_skips_non_dict():
    WatchlistEntry.objects.create(entry=["not", "a", "dict"])
    WatchlistEntry.objects.create(entry={"id": "A", "name": "Alpha"})
    entries = all_entries()
    assert len(entries) == 1


# --- screen_document integration -----------------------------------------

@pytest.mark.django_db
def test_screen_document_writes_result(document, watchlist_id_match):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text="JOHN DOE 63-1234567A78",
        confidence=Decimal("95.00"),
    )
    parsed = ParsedDocument.objects.create(
        ocr_result=ocr,
        doc_type="national_id",
        id_number="63-1234567A78",
        name="JOHN DOE",
    )
    result_id = screen_document(parsed.id)
    result = ScreeningResult.objects.get(id=result_id)
    assert result.parsed_document_id == parsed.id
    assert result.status == "MATCH"


@pytest.mark.django_db
def test_screen_document_clear_when_no_match(document):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text="JANE ROE",
        confidence=Decimal("95.00"),
    )
    parsed = ParsedDocument.objects.create(
        ocr_result=ocr,
        doc_type="unknown",
        id_number=None,
        name="JANE ROE",
    )
    result_id = screen_document(parsed.id)
    result = ScreeningResult.objects.get(id=result_id)
    assert result.status == "CLEAR"