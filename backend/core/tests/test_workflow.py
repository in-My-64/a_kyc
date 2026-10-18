"""
Phase 9 — KYC workflow orchestration.

Covers:
  - start-kyc POST creates a workflow and returns a tracking_id.
  - Duplicate POST for same document returns 409.
  - Happy path via the chain sets status=COMPLETED, current_step=done,
    and records every task id.
  - Failure path sets status=FAILED, current_step=failed_<step>,
    last_error populated.
  - Status endpoint returns the expected JSON shape.
  - Status endpoint enforces ownership (can't see other users' workflows).
"""

from celery import chain
from decimal import Decimal

import pytest

from backend.core.models import KYCWorkflow
from backend.documents.models import Document
from backend.documents.tasks import preprocess_document
from backend.ocr_engine.tasks import run_ocr_task
from backend.risk.tasks import compute_evidence_score, classify_risk
from backend.screening.tasks import screen_document
from backend.verification.tasks import classify_document


pytestmark = pytest.mark.django_db


def _run_chain(document, tracking_id):
    return chain(
        preprocess_document.s(document.id, tracking_id),
        run_ocr_task.s(tracking_id),
        classify_document.s(tracking_id),
        screen_document.s(tracking_id),
        compute_evidence_score.s(tracking_id),
        classify_risk.s(tracking_id),
    ).apply()


# --- start-kyc endpoint ---------------------------------------------------

def test_start_kyc_creates_workflow(authed_client, user, document):
    resp = authed_client.post(
        "/api/start-kyc/", {"document_id": document.id}, format="json",
    )
    assert resp.status_code == 202, resp.content
    body = resp.json()
    assert "tracking_id" in body

    wf = KYCWorkflow.objects.get(tracking_id=body["tracking_id"])
    assert wf.customer_id == user.pk
    assert wf.document_id == document.id
    assert wf.status in ("PENDING", "IN_PROGRESS")


def test_start_kyc_requires_document_id(authed_client):
    resp = authed_client.post("/api/start-kyc/", {}, format="json")
    assert resp.status_code == 400


def test_start_kyc_rejects_other_users_document(authed_client, png_bytes):
    from django.contrib.auth import get_user_model
    from django.core.files.base import ContentFile
    User = get_user_model()
    other = User.objects.create_user(
        username="other", email="o@x.com", password="Test-Pass-1234!",
    )
    doc = Document.objects.create(
        customer=other,
        file=ContentFile(png_bytes, name="theirs.png"),
    )
    resp = authed_client.post(
        "/api/start-kyc/", {"document_id": doc.id}, format="json",
    )
    assert resp.status_code == 404


def test_start_kyc_duplicate_returns_409(authed_client, user, document):
    resp1 = authed_client.post(
        "/api/start-kyc/", {"document_id": document.id}, format="json",
    )
    assert resp1.status_code == 202

    resp2 = authed_client.post(
        "/api/start-kyc/", {"document_id": document.id}, format="json",
    )
    assert resp2.status_code == 409, resp2.content
    body = resp2.json()
    assert body["tracking_id"] == resp1.json()["tracking_id"]


# --- chain drives the workflow state --------------------------------------

def test_chain_happy_path_completes(user, document):
    wf = KYCWorkflow.objects.create(
        customer=user, document=document, status="PENDING",
    )
    tid = str(wf.tracking_id)
    _run_chain(document, tid)

    wf.refresh_from_db()
    assert wf.status == "COMPLETED"
    assert wf.current_step == "done"
    assert wf.last_error == ""

    assert wf.preprocess_task_id
    assert wf.ocr_task_id
    assert wf.classification_task_id
    assert wf.screening_task_id
    assert wf.evidence_score_task_id
    assert wf.risk_classification_task_id


def test_chain_failure_marks_failed(user, document):
    """
    WorkflowTrackingTask.on_failure must mark the workflow FAILED with the
    right current_step and last_error.

    We invoke on_failure directly. Celery's eager mode with
    task_eager_propagates=True short-circuits to the trace caller, and
    autoretry caches the original run() callable, so monkeypatching the task
    inside a test is unreliable. Testing the callback directly exercises
    exactly the code we wrote; wiring-on-exception is Celery's contract.
    """
    wf = KYCWorkflow.objects.create(
        customer=user, document=document, status="PENDING",
    )
    tid = str(wf.tracking_id)

    exc = ValueError("simulated failure for testing")
    preprocess_document.on_failure(
        exc=exc,
        task_id="fake-task-id",
        args=(document.id, tid),
        kwargs={},
        einfo=None,
    )

    wf.refresh_from_db()
    assert wf.status == "FAILED", wf.status
    assert wf.current_step == "failed_preprocess_document", wf.current_step
    assert "simulated failure" in wf.last_error


# --- status endpoint ------------------------------------------------------

def test_status_endpoint_shape(authed_client, user, document):
    wf = KYCWorkflow.objects.create(
        customer=user, document=document, status="PENDING",
    )
    tid = str(wf.tracking_id)
    _run_chain(document, tid)

    resp = authed_client.get(f"/api/status/{tid}/")
    assert resp.status_code == 200, resp.content
    body = resp.json()

    assert body["tracking_id"] == tid
    assert body["status"] == "COMPLETED"
    assert body["current_step"] == "done"
    assert body["last_error"] == ""
    assert set(body["task_ids"].keys()) == {
        "preprocess", "ocr", "classification",
        "screening", "evidence_score", "risk_classification",
    }
    for key in ("created_at", "updated_at"):
        assert key in body


def test_status_endpoint_requires_auth(api_client, user, document):
    wf = KYCWorkflow.objects.create(
        customer=user, document=document, status="PENDING",
    )
    resp = api_client.get(f"/api/status/{wf.tracking_id}/")
    assert resp.status_code in (401, 403)


def test_status_endpoint_404_for_other_user(authed_client, png_bytes):
    from django.contrib.auth import get_user_model
    from django.core.files.base import ContentFile
    User = get_user_model()
    other = User.objects.create_user(
        username="other2", email="o2@x.com", password="Test-Pass-1234!",
    )
    doc = Document.objects.create(
        customer=other,
        file=ContentFile(png_bytes, name="theirs.png"),
    )
    wf = KYCWorkflow.objects.create(
        customer=other, document=doc, status="PENDING",
    )
    resp = authed_client.get(f"/api/status/{wf.tracking_id}/")
    assert resp.status_code == 404