"""
Shared pytest fixtures for all phase tests.

Fixtures here are auto-discovered by pytest from any test file under
`backend/`.

Eager mode: CELERY_TASK_ALWAYS_EAGER is read from the environment by
base.py. CELERY_TASK_EAGER_PROPAGATES is hardcoded — test.py sets it
True, dev.py sets it False. If you run pytest against dev.py (rather
than test.py), task failures surface as 202 responses with the workflow
marked FAILED, not as raised exceptions. Point pytest at test.py via
`DJANGO_SETTINGS_MODULE=backend.kyc_system.settings.test` in pytest.ini
if you want the eager exception-propagation behavior.
"""

import os

# Set BEFORE any Django import. CELERY_TASK_ALWAYS_EAGER is read by
# base.py from the environment; CELERY_TASK_EAGER_PROPAGATES is NOT
# (it is hardcoded in base.py and overridden by test.py).
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "1")

import io
import shutil

import pytest
from django.contrib.auth import get_user_model
from PIL import Image, ImageDraw, ImageFont
from rest_framework.test import APIClient


# --- Optional-dependency detection ----------------------------------------

def _has_tesseract() -> bool:
    return shutil.which("tesseract") is not None


_HAS_TESSERACT = _has_tesseract()

# Marker applied by OCR-dependent tests.
requires_tesseract = pytest.mark.skipif(
    not _HAS_TESSERACT,
    reason="tesseract-ocr binary not installed; skipping OCR test.",
)


# --- Font discovery --------------------------------------------------------
#
# The DejaVu path is Debian/Ubuntu-specific. On other platforms the
# default PIL font is a ~10px bitmap font that OCR cannot read, so tests
# that assert on extracted text fail in a way that looks like a code
# bug. Search a set of common paths and skip OCR assertions if none
# resolve to a real TrueType font.

_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",  # Debian/Ubuntu
    "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",              # Arch
    "/usr/local/share/fonts/DejaVuSansMono-Bold.ttf",            # Homebrew
    "/Library/Fonts/Arial Bold.ttf",                             # macOS
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",         # macOS (newer)
    "C:\\Windows\\Fonts\\arialbd.ttf",                           # Windows
]


def _load_test_font(size: int = 40):
    """Return a TrueType font at `size`, or None if no candidate exists."""
    for path in _FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return None


# --- Pytest configuration --------------------------------------------------

def pytest_configure(config):
    """Best-effort Celery eager mode. Secondary to settings-based config."""
    try:
        from celery import current_app
        current_app.conf.task_always_eager = True
        current_app.conf.task_eager_propagates = True
    except Exception:
        pass


# --- HTTP clients ---------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(
        username="pytestuser",
        email="pytest@example.com",
        password="Test-Pass-1234!",
        first_name="Pytest",
        last_name="User",
    )


@pytest.fixture
def authed_client(api_client, user):
    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return api_client


# --- Image fixtures -------------------------------------------------------

@pytest.fixture
def png_bytes():
    """A blank 100x60 PNG. Useful when content doesn't matter."""
    buf = io.BytesIO()
    Image.new("RGB", (100, 60), "white").save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def id_png_bytes():
    """
    A synthetic National ID image, sized and fonted so that OCR can
    actually read it. Yields text containing:
      id_number: 63-1234567A78
      name:      JOHN DOE
      dob:       1990-01-15

    Skips the calling test if no usable TrueType font is available on
    this machine.
    """
    font = _load_test_font(40)
    if font is None:
        pytest.skip(
            "No TrueType font available at any known path; the synthetic "
            "ID image would render illegibly with PIL's bitmap default.",
        )

    buf = io.BytesIO()
    img = Image.new("RGB", (800, 320), "white")
    d = ImageDraw.Draw(img)
    d.text((30, 20),  "REPUBLIC OF ZIMBABWE", font=font, fill="black")
    d.text((30, 90),  "JOHN DOE",             font=font, fill="black")
    d.text((30, 160), "ID: 63-1234567A78",    font=font, fill="black")
    d.text((30, 230), "DOB: 1990-01-15",      font=font, fill="black")
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def pdf_bytes():
    """
    A minimal one-page PDF containing the same content as
    id_png_bytes. Uses PyMuPDF, which is already a runtime dependency.
    """
    try:
        import pymupdf as fitz  # type: ignore[import-not-found]
    except ImportError:
        try:
            import fitz  # type: ignore[import-not-found]
        except ImportError:
            pytest.skip("PyMuPDF not installed; PDF fixtures unavailable.")

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4 at 72 dpi
    text = (
        "REPUBLIC OF ZIMBABWE\n"
        "JOHN DOE\n"
        "ID: 63-1234567A78\n"
        "DOB: 1990-01-15\n"
    )
    page.insert_text((50, 100), text, fontsize=14)
    buf = doc.tobytes()
    doc.close()
    return buf


# --- Model fixtures -------------------------------------------------------

@pytest.fixture
def document(db, user, id_png_bytes):
    from django.core.files.base import ContentFile
    from backend.documents.models import Document
    return Document.objects.create(
        customer=user,
        file=ContentFile(id_png_bytes, name="fixture_id.png"),
    )


@pytest.fixture
def document_pdf(db, user, pdf_bytes):
    from django.core.files.base import ContentFile
    from backend.documents.models import Document
    return Document.objects.create(
        customer=user,
        file=ContentFile(pdf_bytes, name="fixture_id.pdf"),
    )


@pytest.fixture
def watchlist_id_match(db):
    from backend.screening.models import WatchlistEntry
    return WatchlistEntry.objects.create(
        entry={"id": "63-1234567A78", "name": "JOHN DOE"},
    )


@pytest.fixture
def watchlist_name_match(db):
    from backend.screening.models import WatchlistEntry
    return WatchlistEntry.objects.create(
        entry={"id": "ZZ999", "name": "JOHN DOE"},
    )