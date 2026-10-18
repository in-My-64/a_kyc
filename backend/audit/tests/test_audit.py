"""
Phase 8 — Audit log.

Covers:
  - customer_created fires with PII redacted (email, names).
  - document_uploaded fires with file path redacted.
  - ocr_started + ocr_completed fire when OCR runs.
  - document_parsed fires when classification runs.
  - screening_completed, evidence_scored, risk_assigned fire.
  - Middleware does NOT log requests to /api/audit/.
  - Middleware redacts JSON bodies.
  - Middleware logs POST to /api/customers/ with redacted password.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from backend.audit.models import AuditLogEntry
from backend.audit.redaction import PII_KEYS, REDACTED, redact


# --- redaction (pure function) --------------------------------------------

def test_redact_top_level_pii_keys():
    data = {
        "email": "a@b.com",
        "first_name": "Alice",
        "password": "hunter2",
        "username": "alice",
    }
    out = redact(data)
    assert out["email"] == REDACTED
    assert out["first_name"] == REDACTED
    assert out["password"] == REDACTED
    assert out["username"] == "alice"  # not PII


def test_redact_nested_dict():
    data = {"user": {"email": "a@b.com", "age": 30}}
    out = redact(data)
    assert out["user"]["email"] == REDACTED
    assert out["user"]["age"] == 30


def test_redact_inside_lists():
    data = {"items": [{"email": "a@b.com"}, {"email": "c@d.com"}]}
    out = redact(data)
    assert out["items"][0]["email"] == REDACTED
    assert out["items"][1]["email"] == REDACTED


def test_redact_passes_through_scalars():
    assert redact("hello") == "hello"
    assert redact(42) == 42
    assert redact(None) is None


def test_pii_keys_contains_expected():
    for k in ("email", "password", "id_number", "file", "extracted_text"):
        assert k in PII_KEYS


# --- signals --------------------------------------------------------------

@pytest.mark.django_db
def test_customer_created_logs_redacted(user):
    entries = AuditLogEntry.objects.filter(action="customer_created")
    assert entries.count() >= 1
    entry = entries.latest("id")
    assert entry.user_id == user.pk
    assert entry.details.get("email") == REDACTED
    assert "pytest@example.com" not in str(entry.details)
    assert entry.details.get("username") == "pytestuser"


@pytest.mark.django_db
def test_document_uploaded_logs_redacted(user, png_bytes):
    from backend.documents.models import Document
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("evi.png", png_bytes, content_type="image/png"),
    )
    entry = AuditLogEntry.objects.filter(action="document_uploaded").latest("id")
    assert entry.user_id == user.pk
    assert entry.details.get("document_id") == doc.pk
    assert entry.details.get("file") == REDACTED
    assert "evi.png" not in str(entry.details)


@pytest.mark.django_db
def test_ocr_started_fires_on_create(user, png_bytes):
    from backend.documents.models import Document
    from backend.ocr_engine.models import OCRResult
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("x.png", png_bytes, content_type="image/png"),
    )
    OCRResult.objects.create(document=doc)
    entry = AuditLogEntry.objects.filter(action="ocr_started").latest("id")
    assert entry.user_id == user.pk
    assert "ocr_result_id" in entry.details


@pytest.mark.django_db
def test_ocr_completed_fires_when_text_written(user, png_bytes):
    from backend.documents.models import Document
    from backend.ocr_engine.models import OCRResult
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("x.png", png_bytes, content_type="image/png"),
    )
    ocr = OCRResult.objects.create(document=doc)
    ocr.extracted_text = "REPUBLIC OF ZIMBABWE"
    ocr.confidence = Decimal("85.00")
    ocr.save()
    entry = AuditLogEntry.objects.filter(action="ocr_completed").latest("id")
    assert entry.user_id == user.pk
    assert entry.details.get("extracted_text") == REDACTED
    assert "REPUBLIC" not in str(entry.details)


@pytest.mark.django_db
def test_document_parsed_logs_redacted(user, png_bytes):
    from backend.documents.models import Document
    from backend.ocr_engine.models import OCRResult
    from backend.verification.models import ParsedDocument
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("x.png", png_bytes, content_type="image/png"),
    )
    ocr = OCRResult.objects.create(document=doc)
    ParsedDocument.objects.create(
        ocr_result=ocr,
        doc_type="national_id",
        id_number="63-1234567A78",
        name="JOHN DOE",
    )
    entry = AuditLogEntry.objects.filter(action="document_parsed").latest("id")
    assert entry.user_id == user.pk
    assert entry.details.get("id_number") == REDACTED
    assert entry.details.get("name") == REDACTED
    assert "JOHN" not in str(entry.details)


@pytest.mark.django_db
def test_screening_completed_fires(user, png_bytes):
    from backend.documents.models import Document
    from backend.ocr_engine.models import OCRResult
    from backend.verification.models import ParsedDocument
    from backend.screening.models import ScreeningResult
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("x.png", png_bytes, content_type="image/png"),
    )
    ocr = OCRResult.objects.create(document=doc)
    parsed = ParsedDocument.objects.create(ocr_result=ocr, doc_type="unknown")
    ScreeningResult.objects.create(
        parsed_document=parsed, status="CLEAR", details={},
    )
    entry = AuditLogEntry.objects.filter(action="screening_completed").latest("id")
    assert entry.user_id == user.pk
    assert entry.details.get("status") == "CLEAR"


@pytest.mark.django_db
def test_evidence_scored_fires(user, png_bytes):
    from backend.documents.models import Document
    from backend.ocr_engine.models import OCRResult
    from backend.verification.models import ParsedDocument
    from backend.risk.models import EvidenceScore
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("x.png", png_bytes, content_type="image/png"),
    )
    ocr = OCRResult.objects.create(document=doc)
    parsed = ParsedDocument.objects.create(ocr_result=ocr, doc_type="unknown")
    EvidenceScore.objects.create(
        parsed_document=parsed, score=Decimal("75.00"), breakdown={},
    )
    entry = AuditLogEntry.objects.filter(action="evidence_scored").latest("id")
    assert entry.user_id == user.pk
    assert float(entry.details.get("score")) == 75.0


@pytest.mark.django_db
def test_risk_assigned_fires(user, png_bytes):
    from backend.documents.models import Document
    from backend.ocr_engine.models import OCRResult
    from backend.verification.models import ParsedDocument
    from backend.risk.models import RiskClassification
    doc = Document.objects.create(
        customer=user,
        file=SimpleUploadedFile("x.png", png_bytes, content_type="image/png"),
    )
    ocr = OCRResult.objects.create(document=doc)
    parsed = ParsedDocument.objects.create(ocr_result=ocr, doc_type="unknown")
    RiskClassification.objects.create(
        parsed_document=parsed, tier="MEDIUM", reason=["test reason"],
    )
    entry = AuditLogEntry.objects.filter(action="risk_assigned").latest("id")
    assert entry.user_id == user.pk
    assert entry.details.get("tier") == "MEDIUM"


# --- middleware -----------------------------------------------------------

@pytest.mark.django_db
def test_middleware_logs_post_with_redacted_password(api_client):
    payload = {
        "username": "mid_test",
        "email": "mid@example.com",
        "password": "SuperSecret-1234!",
    }
    resp = api_client.post("/api/customers/", payload, format="json")
    assert resp.status_code == 201

    entries = AuditLogEntry.objects.filter(action="http_post")
    assert entries.count() >= 1
    entry = entries.latest("id")
    body = entry.details.get("body") or {}
    assert body.get("password") == REDACTED
    assert body.get("email") == REDACTED
    assert body.get("username") == "mid_test"
    assert "SuperSecret" not in str(entry.details)
    assert entry.success is True


@pytest.mark.django_db
def test_middleware_skips_audit_endpoint(authed_client):
    """
    Requests to /api/audit/ must not be logged.

    SQLite does not support `__contains` on JSONField, so filter in Python.
    """
    authed_client.get("/api/audit/")
    paths = [
        (e.details or {}).get("path", "")
        for e in AuditLogEntry.objects.all()
    ]
    assert not any("/api/audit/" in p for p in paths), paths


@pytest.mark.django_db
def test_middleware_does_not_log_get(api_client):
    AuditLogEntry.objects.all().delete()
    api_client.get("/api/documents/")
    assert not AuditLogEntry.objects.filter(action="http_get").exists()