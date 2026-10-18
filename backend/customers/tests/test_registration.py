"""
Phase 1 — Customer registration & auth.

Covers:
  - Registration via POST /api/customers/ (open to anonymous).
  - Password is hashed, never echoed in the response.
  - Login via POST /api/auth/token/ returns a DRF token.
  - Unauthenticated list of customers is forbidden.
  - /api/customers/me/ returns the authenticated user.
"""

import pytest
from django.contrib.auth import get_user_model


pytestmark = pytest.mark.django_db


def test_register_creates_user_and_hashes_password(api_client):
    User = get_user_model()

    payload = {
        "username": "alice",
        "email": "alice@example.com",
        "password": "Test-Pass-1234!",
        "date_of_birth": "1990-01-01",
        "nationality": "ZW",
    }
    resp = api_client.post("/api/customers/", payload, format="json")
    assert resp.status_code == 201, resp.content

    # Response must not leak password
    body = resp.json()
    assert "password" not in body
    assert body["username"] == "alice"
    assert body["email"] == "alice@example.com"

    # Password must be hashed
    u = User.objects.get(username="alice")
    assert u.password != "Test-Pass-1234!"
    assert u.check_password("Test-Pass-1234!")


def test_register_rejects_duplicate_username(api_client, user):
    resp = api_client.post(
        "/api/customers/",
        {
            "username": user.username,
            "email": "other@example.com",
            "password": "Test-Pass-1234!",
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "username" in resp.json()


def test_register_rejects_weak_password(api_client):
    resp = api_client.post(
        "/api/customers/",
        {
            "username": "bob",
            "email": "bob@example.com",
            "password": "short",
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "password" in resp.json()


def test_login_returns_token(api_client, user):
    resp = api_client.post(
        "/api/auth/token/",
        {"username": user.username, "password": "Test-Pass-1234!"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert "token" in body
    assert body["user_id"] == user.pk
    assert body["username"] == user.username


def test_login_rejects_wrong_password(api_client, user):
    resp = api_client.post(
        "/api/auth/token/",
        {"username": user.username, "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 400


def test_anon_list_customers_forbidden(api_client):
    resp = api_client.get("/api/customers/")
    assert resp.status_code in (401, 403)


def test_authed_me_returns_self(authed_client, user):
    resp = authed_client.get("/api/customers/me/")
    assert resp.status_code == 200
    assert resp.json()["username"] == user.username
    assert resp.json()["id"] == user.pk
