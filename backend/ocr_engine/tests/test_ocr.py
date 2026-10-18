"""
Phase 3 — OCR extraction.

Covers:
  - preprocess_document creates a processed_file and an OCRResult.
  - run_ocr_task fills extracted_text, confidence, details.
  - Missing processed_file raises a clear error.
  - Task is idempotent — running twice doesn't corrupt state.
"""

from decimal import Decimal

import pytest

from backend.documents.models import Document
from backend.documents.tasks import preprocess_document
from backend.ocr_engine.models import OCRResult
from backend.ocr_engine.tasks import run_ocr_task


pytestmark = pytest.mark.django_db


def test_preprocess_creates_processed_file_and_ocr_result(document):
    assert not document.processed_file

    ocr_id = preprocess_document(document.id)
    ocr = OCRResult.objects.get(id=ocr_id)

    document.refresh_from_db()
    assert document.processed_file, "processed_file not set"
    assert document.processed_file.size > 0
    assert ocr.document_id == document.id


def test_run_ocr_fills_text_and_confidence(document):
    ocr_id = preprocess_document(document.id)
    run_ocr_task(ocr_id)

    ocr = OCRResult.objects.get(id=ocr_id)
    assert ocr.extracted_text is not None
    assert len(ocr.extracted_text) > 0, "OCR produced no text"
    assert ocr.confidence is not None
    assert Decimal("0") <= ocr.confidence <= Decimal("100")
    assert ocr.details is not None
    assert "word_count" in ocr.details
    assert "n_conf" in ocr.details


def test_run_ocr_without_processed_file_raises(document):
    """Document has `file` but no `processed_file`. Task must fail loudly."""
    ocr = OCRResult.objects.create(document=document)

    with pytest.raises(ValueError, match="processed_file"):
        run_ocr_task(ocr.id)


def test_run_ocr_is_idempotent(document):
    ocr_id = preprocess_document(document.id)
    run_ocr_task(ocr_id)
    first = OCRResult.objects.get(id=ocr_id)
    first_text = first.extracted_text
    first_conf = first.confidence

    # Second call rewrites the same fields
    run_ocr_task(ocr_id)
    second = OCRResult.objects.get(id=ocr_id)
    assert second.extracted_text == first_text
    assert second.confidence == first_conf


def test_preprocess_missing_document_raises():
    with pytest.raises(Document.DoesNotExist):
        preprocess_document(999999)
