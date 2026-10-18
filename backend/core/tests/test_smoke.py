"""Smoke test — proves pytest + pytest-django + conftest fixtures all work."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from backend.risk.tasks import classify_risk_tier


@pytest.mark.django_db
def test_db_works():
    User = get_user_model()
    u = User.objects.create_user(username="smoke", email="s@x.com", password="x")
    assert u.pk is not None


def test_pure_function_no_db():
    tier, reasons = classify_risk_tier(Decimal("100"), "CLEAR")
    assert tier == "LOW"
    assert reasons


def test_api_client_fixture(api_client):
    resp = api_client.get("/api/documents/")
    # Unauthenticated GET -> 401 or 403, not a 500
    assert resp.status_code in (401, 403)


@pytest.mark.django_db
def test_user_fixture(user):
    assert user.username == "pytestuser"
    assert user.check_password("Test-Pass-1234!")


@pytest.mark.django_db
def test_authed_client_fixture(authed_client):
    resp = authed_client.get("/api/documents/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_png_fixture(png_bytes):
    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(png_bytes) > 50


@pytest.mark.django_db
def test_document_fixture(document):
    assert document.customer.username == "pytestuser"
    # Django's FileField appends a random suffix when the name collides:
    # e.g. "uploads/fixture_id_B3bn1pa.png". Check prefix + extension.
    assert document.file.name.endswith(".png")
    assert "fixture_id" in document.file.name