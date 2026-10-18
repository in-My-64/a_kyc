"""
Phase 2 — Document upload.

Covers:
  - Multipart upload of a PNG returns 201 and links to request.user.
  - The file is stored and readable.
  - Unauthenticated upload is rejected.
  - Missing file is rejected (400).
  - Wrong MIME / fake image / empty file rejected by validators.
  - Users only see their own documents in list/detail.
"""

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from backend.documents.models import Document


pytestmark = pytest.mark.django_db


def _upload(client, name, content, ctype):
    f = SimpleUploadedFile(name, content, content_type=ctype)
    return client.post("/api/documents/", {"file": f}, format="multipart")


def test_upload_png_returns_201(authed_client, user, png_bytes):
    resp = _upload(authed_client, "id.png", png_bytes, "image/png")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["id"] is not None
    assert "file" in body

    # Linked to request.user
    doc = Document.objects.get(id=body["id"])
    assert doc.customer_id == user.pk
    # File actually exists on disk
    assert doc.file and doc.file.size > 0


def test_upload_requires_auth(api_client, png_bytes):
    resp = _upload(api_client, "id.png", png_bytes, "image/png")
    assert resp.status_code in (401, 403)


def test_upload_missing_file_returns_400(authed_client):
    resp = authed_client.post("/api/documents/", {}, format="multipart")
    assert resp.status_code == 400
    assert "file" in resp.json()


def test_upload_rejects_non_image_mime(authed_client):
    resp = _upload(authed_client, "note.txt", b"nope", "text/plain")
    assert resp.status_code == 400
    assert "file" in resp.json()


def test_upload_rejects_fake_png_content(authed_client):
    """MIME says image/png, content isn't."""
    resp = _upload(authed_client, "fake.png", b"not-an-image", "image/png")
    assert resp.status_code == 400
    assert "file" in resp.json()


def test_upload_rejects_empty_file(authed_client):
    resp = _upload(authed_client, "empty.png", b"", "image/png")
    assert resp.status_code == 400
    assert "file" in resp.json()


def test_user_only_sees_own_documents(authed_client, user, png_bytes):
    # Create one doc for `user`
    _upload(authed_client, "mine.png", png_bytes, "image/png")

    # Create a second user + doc directly
    User = get_user_model()
    other = User.objects.create_user(
        username="other", email="o@x.com", password="Test-Pass-1234!",
    )
    Document.objects.create(
        customer=other,
        file=SimpleUploadedFile("theirs.png", png_bytes, content_type="image/png"),
    )

    resp = authed_client.get("/api/documents/")
    assert resp.status_code == 200
    # Paginated: results list
    body = resp.json()
    results = body["results"] if isinstance(body, dict) and "results" in body else body
    for item in results:
        doc = Document.objects.get(id=item["id"])
        assert doc.customer_id == user.pk



def test_upload_defaults_to_unknown_doc_type(authed_client, png_bytes):
    resp = _upload(authed_client, "id.png", png_bytes, "image/png")
    assert resp.status_code == 201
    assert resp.json()["doc_type"] == "unknown"


def test_upload_accepts_explicit_doc_type(authed_client, png_bytes):
    f = SimpleUploadedFile("id.png", png_bytes, content_type="image/png")
    resp = authed_client.post(
        "/api/documents/",
        {"file": f, "doc_type": "passport"},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    assert resp.json()["doc_type"] == "passport"


def test_upload_rejects_invalid_doc_type(authed_client, png_bytes):
    f = SimpleUploadedFile("id.png", png_bytes, content_type="image/png")
    resp = authed_client.post(
        "/api/documents/",
        {"file": f, "doc_type": "not-a-real-type"},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "doc_type" in resp.json()