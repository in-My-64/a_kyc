"""
Phase 4 — Regex-based field extraction + OCR confusion correction.

Covers:
  - parse_date across common formats.
  - extract_name skips stopwords and finds 2-3 token runs.
  - _extract_field matches patterns raw.
  - _extract_field fixes OCR confusions one character at a time.
  - extract_date_near picks up dates on lines with BIRTH/DOB/EXPIR.
  - classify_document writes a ParsedDocument.
  - Pattern boundary: exactly-matching ID passes, off-by-one fails.
"""

from datetime import date
from decimal import Decimal

import pytest

from backend.ocr_engine.models import OCRResult
from backend.verification.models import ParsedDocument
from backend.verification.tasks import (
    _extract_field,
    classify_document,
    extract_date_near,
    extract_name,
    extract_nationality,
    parse_date,
)


# --- pure functions -------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("1990-01-15", date(1990, 1, 15)),
    ("15/01/1990", date(1990, 1, 15)),
    ("15-01-1990", date(1990, 1, 15)),
    ("1990/01/15", date(1990, 1, 15)),
    ("15.01.1990", date(1990, 1, 15)),
    ("1990.01.15", date(1990, 1, 15)),
    ("not-a-date", None),
    ("", None),
    (None, None),
])
def test_parse_date_formats(raw, expected):
    assert parse_date(raw) == expected


def test_extract_name_skips_headers():
    text = "REPUBLIC OF ZIMBABWE\nJOHN DOE\nID: 63-1234567A78"
    assert extract_name(text) == "JOHN DOE"


def test_extract_name_title_case():
    assert extract_name("John Doe\nid 12345") == "John Doe"


def test_extract_name_none_when_no_candidate():
    assert extract_name("12345\n67890\n") is None


def test_extract_field_raw_match():
    corrections = {}
    id_num, corrections, matched = _extract_field(
        "ID: 63-1234567A78", "unknown", corrections, "id_number",
    )
    assert id_num == "63-1234567A78"
    assert matched == "national_id"
    assert corrections == {}


def test_extract_field_fixes_single_confusion():
    corrections = {}
    id_num, corrections, matched = _extract_field(
        "ID: 63-I234567A78", "national_id", corrections, "id_number",
    )
    assert id_num == "63-1234567A78"
    assert matched == "national_id"
    assert corrections["id_number"]["swaps"] == {3: "I->1"}


def test_extract_field_fixes_letter_O_to_digit():
    corrections = {}
    id_num, corrections, matched = _extract_field(
        "P: AB1234O6", "passport", corrections, "id_number",
    )
    assert id_num == "AB123406"
    assert matched == "passport"


def test_extract_field_no_match():
    corrections = {}
    id_num, corrections, matched = _extract_field(
        "nothing here at all", "national_id", corrections, "id_number",
    )
    assert id_num is None
    assert matched is None


def test_extract_date_near_birth():
    text = "REPUBLIC OF ZIMBABWE\nDOB 1990-01-15\nID 63-1234567A78"
    assert extract_date_near(text, ["BIRTH", "DOB"]) == date(1990, 1, 15)


def test_extract_date_near_expiry():
    text = "PASSPORT\nEXPIRES 2030-06-30"
    assert extract_date_near(text, ["EXPIR", "VALID"]) == date(2030, 6, 30)


def test_extract_nationality():
    text = "REPUBLIC OF ZIMBABWE\nZW\nID 123"
    # First 2-3 letter uppercase token not in skip set
    nat = extract_nationality(text)
    assert nat is not None
    assert 2 <= len(nat) <= 3


# --- pattern boundaries ---------------------------------------------------

@pytest.mark.parametrize("token,doc_type,should_match", [
    # National ID: ^\d{2}-\d{6,7}[A-Z]\d{2}$
    ("63-1234567A78", "national_id", True),
    ("63-123456A78", "national_id", True),      # 6 digits in middle
    ("63-12345678A78", "national_id", False),   # 8 digits — too many
    ("6-1234567A78", "national_id", False),     # 1 digit prefix
    ("63-1234567a78", "national_id", True),     # lowercase normalized to upper
    ("63-1234567A7", "national_id", False),     # 1 trailing digit
    # Passport: ^[A-Z]{2}\d{6}$
    ("AB123456", "passport", True),
    ("A123456", "passport", False),
    ("AB12345", "passport", False),
    # Licence: ^\d{7,8}[A-Z]{0,2}$
    ("1234567", "licence", True),
    ("12345678AB", "licence", True),
    ("123456", "licence", False),
])
def test_pattern_boundaries(token, doc_type, should_match):
    corrections = {}
    result, _, matched = _extract_field(
        token, doc_type, corrections, "id_number",
    )
    if should_match:
        assert result == token.upper(), f"{token} should match {doc_type} (normalized)"
        assert matched == doc_type
    else:
        assert result is None, f"{token} should NOT match {doc_type}"


# --- integration: classify_document --------------------------------------

def test_classify_document_writes_parsed(db, document):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text=(
            "REPUBLIC OF ZIMBABWE\n"
            "JOHN DOE\n"
            "ID: 63-1234567A78\n"
            "DOB: 1990-01-15\n"
            "EXPIRY: 2030-06-30\n"
        ),
        confidence=Decimal("95.00"),
    )
    parsed_id = classify_document(ocr.id)
    parsed = ParsedDocument.objects.get(id=parsed_id)

    assert parsed.id_number == "63-1234567A78"
    assert parsed.doc_type == "national_id"
    assert parsed.name == "JOHN DOE"
    assert parsed.dob == date(1990, 1, 15)
    assert parsed.expiry == date(2030, 6, 30)
    assert parsed.corrections == {}


def test_classify_document_handles_garbage(db, document):
    ocr = OCRResult.objects.create(
        document=document,
        extracted_text="!!!\n@@@\n###",
        confidence=Decimal("10.00"),
    )
    parsed_id = classify_document(ocr.id)
    parsed = ParsedDocument.objects.get(id=parsed_id)

    assert parsed.id_number is None
    assert parsed.name is None
    assert parsed.doc_type == "unknown"
