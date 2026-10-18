"""
Smoke-test script for the local KYC API.

Run against the dev server (port 8001) with:
    python backend/evaluation/evaluation_script.py

Not part of the Django app — imported by nothing.
"""

import asyncio
import os
import tempfile

import httpx
from faker import Faker
from PIL import Image, ImageDraw

API_URL = os.environ.get("KYC_API_URL", "http://localhost:8001/api")
PASSWORD = "Test-Pass-1234!"

fake = Faker()


async def register_user(client: httpx.AsyncClient) -> tuple[dict, str]:
    """Return (user_json, password). Password is needed for login."""
    payload = {
        "username": fake.user_name(),
        "email": fake.email(),
        "password": PASSWORD,
        "date_of_birth": "1990-01-01",
        "nationality": "ZW",
    }
    resp = await client.post(f"{API_URL}/customers/", json=payload)
    resp.raise_for_status()
    return resp.json(), PASSWORD


async def login(client: httpx.AsyncClient, username: str, password: str) -> str:
    r = await client.post(
        f"{API_URL}/auth/token/",
        json={"username": username, "password": password},
    )
    r.raise_for_status()
    token = r.json()["token"]
    client.headers["Authorization"] = f"Token {token}"
    return token


async def upload_doc(
    client: httpx.AsyncClient,
    doc_type: str = "unknown",
) -> dict:
    """
    Create a small synthetic PNG with the doc type rendered on it, upload
    it as multipart, and return the parsed JSON. The temp file is always
    removed, even if the request fails.
    """
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        img = Image.new("RGB", (400, 200), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((20, 80), doc_type.upper(), fill=(0, 0, 0))
        img.save(path)

        with open(path, "rb") as f:
            files = {"file": (os.path.basename(path), f, "image/png")}
            data = {"doc_type": doc_type}
            resp = await client.post(
                f"{API_URL}/documents/", files=files, data=data,
            )
        resp.raise_for_status()
        return resp.json()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        user, password = await register_user(client)
        print(f"registered: {user['username']}")

        await login(client, user["username"], password)
        print("logged in")

        doc = await upload_doc(client, "national_id")
        print(f"uploaded document #{doc['id']}")


if __name__ == "__main__":
    asyncio.run(main())