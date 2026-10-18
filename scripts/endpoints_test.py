"""
Walk every API endpoint against a running dev server.

Usage:
  1. In another terminal: CELERY_TASK_ALWAYS_EAGER=1 python manage.py runserver
  2. python scripts/endpoints_test.py
"""

import io
import sys
import uuid

import httpx
from PIL import Image, ImageDraw, ImageFont


BASE = "http://127.0.0.1:8000"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

passed = 0
failed = 0


def check(label, resp, expect):
    global passed, failed
    ok = resp.status_code == expect
    mark = "OK " if ok else "ERR"
    print(f"[{mark}] {label:45s} {resp.status_code}  (expected {expect})")
    try:
        body = resp.json()
        snippet = str(body)[:220]
        print(f"       {snippet}")
    except Exception:
        if resp.text:
            print(f"       {resp.text[:220]}")
    if ok:
        passed += 1
    else:
        failed += 1
    return ok


def make_id_image():
    img = Image.new("RGB", (800, 320), "white")
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 40)
    d.text((30, 20),  "REPUBLIC OF ZIMBABWE", font=font, fill="black")
    d.text((30, 90),  "JOHN DOE",             font=font, fill="black")
    d.text((30, 160), "ID: 63-1234567A78",    font=font, fill="black")
    d.text((30, 230), "DOB: 1990-01-15",      font=font, fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def main():
    client = httpx.Client(base_url=BASE, timeout=60.0)
    anon = httpx.Client(base_url=BASE, timeout=10.0)

    print("=" * 72)
    print("PUBLIC ENDPOINTS")
    print("=" * 72)

    check("GET  /api/healthz/", client.get("/api/healthz/"), 200)

    uname = f"ep_{uuid.uuid4().hex[:8]}"
    email = f"{uname}@example.com"
    password = "Test-Pass-1234!"

    r = client.post("/api/customers/", json={
        "username": uname,
        "email": email,
        "password": password,
        "date_of_birth": "1990-01-01",
        "nationality": "ZW",
    })
    check("POST /api/customers/", r, 201)

    r = client.post("/api/auth/token/", json={
        "username": uname, "password": password,
    })
    check("POST /api/auth/token/", r, 200)
    token = r.json()["token"]
    client.headers["Authorization"] = f"Token {token}"

    print()
    print("=" * 72)
    print("AUTHENTICATED — CUSTOMER")
    print("=" * 72)

    r = client.get("/api/customers/me/")
    check("GET  /api/customers/me/", r, 200)
    user_id = r.json()["id"]

    check(f"GET  /api/customers/{user_id}/", client.get(f"/api/customers/{user_id}/"), 200)
    check("GET  /api/customers/ (non-staff)", client.get("/api/customers/"), 403)

    print()
    print("=" * 72)
    print("DOCUMENTS")
    print("=" * 72)

    png = make_id_image()

    r = client.post(
        "/api/documents/",
        files={"file": ("test_id.png", png, "image/png")},
        data={"doc_type": "national_id"},
    )
    check("POST /api/documents/ (valid PNG)", r, 201)
    doc_id = r.json()["id"]

    check("GET  /api/documents/", client.get("/api/documents/"), 200)
    check(f"GET  /api/documents/{doc_id}/", client.get(f"/api/documents/{doc_id}/"), 200)

    r = client.post(
        "/api/documents/",
        files={"file": ("bad.txt", b"nope", "text/plain")},
    )
    check("POST /api/documents/ (bad MIME)", r, 400)

    r = client.post(
        "/api/documents/",
        files={"file": ("fake.png", b"not-an-image", "image/png")},
    )
    check("POST /api/documents/ (fake PNG)", r, 400)

    print()
    print("=" * 72)
    print("WORKFLOW")
    print("=" * 72)

    r = client.post("/api/start-kyc/", json={"document_id": doc_id})
    check("POST /api/start-kyc/", r, 202)
    tracking = r.json()["tracking_id"]

    r = client.post("/api/start-kyc/", json={"document_id": doc_id})
    check("POST /api/start-kyc/ (duplicate)", r, 409)

    r = client.get(f"/api/status/{tracking}/")
    check("GET  /api/status/<tid>/", r, 200)
    status_body = r.json()
    print(f"       status={status_body['status']} step={status_body['current_step']}")
    print(f"       task_ids={list(status_body['task_ids'].keys())}")

    r = client.get(f"/api/status/{uuid.uuid4()}/")
    check("GET  /api/status/<bogus>/", r, 404)

    print()
    print("=" * 72)
    print("DOWNSTREAM RESULTS")
    print("=" * 72)

    check("GET  /api/ocr-results/", client.get("/api/ocr-results/"), 200)
    check("GET  /api/parsed-documents/", client.get("/api/parsed-documents/"), 200)
    check("GET  /api/screenings/", client.get("/api/screenings/"), 200)
    check("GET  /api/risk/", client.get("/api/risk/"), 200)

    print()
    print("=" * 72)
    print("AUTHORIZATION BOUNDARIES")
    print("=" * 72)

    check("GET  /api/documents/ (anon)", anon.get("/api/documents/"), 401)
    check("GET  /api/audit/ (non-staff)", client.get("/api/audit/"), 403)
    check("GET  /api/status/<tid>/ (anon)", anon.get(f"/api/status/{tracking}/"), 401)

    print()
    print("=" * 72)
    print(f"PASSED: {passed}    FAILED: {failed}")
    print("=" * 72)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
