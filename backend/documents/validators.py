"""
Upload validation for Document.file.

Defense in depth, in order:

  1. Size cap (settings.MAX_UPLOAD_SIZE_BYTES).
  2. Extension scan — every suffix on the filename must be safe.
  3. Declared MIME type must be in settings.ALLOWED_UPLOAD_MIME_TYPES.
     An empty declaration or application/octet-stream is treated as
     "no hint" — Content-Type is attacker-controlled, so a strict check
     against a hostile header is a footgun. The sniff is the truth.
  4. Content sniffed from magic bytes must be an accepted kind, and if
     a non-hintless MIME was declared, it must agree with the sniff.
  5. For Pillow-decodable images: open, check dimensions, then force a
     full decode via load() so truncated files fail here rather than in
     the worker. The pixel cap bounds the decode cost.
  6. For PDFs: a quick PyMuPDF open to reject password-protected and
     zero-page documents at upload time, rather than in the worker.

Any content rejection produces a specific, actionable message.
"""

import os

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

from .sniff import (
    ACCEPTED_KINDS,
    PIL_FORMAT_TO_KIND,
    kind_for_mime,
    mime_is_hintless,
    sniff_kind,
)


_DANGEROUS_EXTENSIONS = {
    ".exe", ".dll", ".so", ".bat", ".cmd", ".sh", ".ps1", ".jar",
    ".js", ".html", ".htm", ".svg", ".php", ".py", ".rb",
}

# Hard cap on pixel count. 50 MP ≈ 7071×7071.
MAX_PIXELS = 50_000_000

# Sniffed kinds for which Pillow can act as the verifier. Derived from the
# sniff module's own format map so the two cannot drift apart. The decode gate
# keys on THIS, never on the declared MIME: Content-Type is attacker-controlled,
# and gating on it let an `application/octet-stream` upload skip the full
# decode and the pixel cap entirely.
_PILLOW_KINDS = frozenset(PIL_FORMAT_TO_KIND.values()) | {"heic"}

# Errors Pillow can raise for malicious or corrupt input. The full set:
#   - UnidentifiedImageError: unknown format
#   - OSError: I/O or structural issue
#   - SyntaxError: structural error from verify()/load() on some formats
#   - ValueError / EOFError: malformed payloads
#   - DecompressionBombError: pixel count above Pillow's hard limit;
#     subclasses Exception, not OSError, so a bare OSError catch misses it
_PILLOW_ERRORS = (
    UnidentifiedImageError,
    OSError,
    SyntaxError,
    ValueError,
    EOFError,
    Image.DecompressionBombError,
)


def validate_upload_size(f):
    limit = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10 * 1024 * 1024)
    if f.size == 0:
        raise ValidationError("The uploaded file is empty.")
    if f.size > limit:
        raise ValidationError(
            f"File too large ({_human(f.size)}). Maximum is {_human(limit)}."
        )


def _all_extensions(name: str) -> list[str]:
    base = os.path.basename(name or "")
    if "." not in base:
        return []
    parts = base.split(".")
    return [f".{p.lower()}" for p in parts[1:] if p]


def validate_mime_type(f):
    # The extension scan is unconditional — it catches smuggled
    # double extensions independently of the MIME allowlist.
    name = getattr(f, "name", "") or ""
    for ext in _all_extensions(name):
        if ext in _DANGEROUS_EXTENSIONS:
            raise ValidationError(f"File extension {ext} is not permitted.")

    allowed = getattr(settings, "ALLOWED_UPLOAD_MIME_TYPES", None)
    if not allowed:
        return
    ctype = (getattr(f, "content_type", None) or "").lower()
    if mime_is_hintless(ctype):
        # No usable declaration. Sniffing decides the type in
        # validate_file_content; refusing here would reject legitimate
        # uploads from mobile clients that send octet-stream.
        return
    if ctype not in allowed:
        readable = ", ".join(sorted(allowed))
        raise ValidationError(
            f"Unsupported file type ({ctype}). Allowed: {readable}."
        )


def validate_file_content(f):
    """
    Confirm the actual bytes are an accepted type, and if a declared
    MIME type was provided, that it agrees with the sniff.
    """
    ctype = (getattr(f, "content_type", "") or "").lower()

    try:
        pos = f.tell()
    except (AttributeError, OSError):
        pos = None

    try:
        f.seek(0)
        head = f.read(64)
        kind = sniff_kind(head)

        if kind is None:
            raise ValidationError(
                "The file content is not a recognised format."
            )
        if kind not in ACCEPTED_KINDS:
            raise ValidationError(
                f"Unsupported file type ({kind})."
            )

        # If a specific MIME was declared, it must agree with the sniff.
        # A hintless declaration skips this check.
        if not mime_is_hintless(ctype):
            expected = kind_for_mime(ctype)
            if expected is not None and expected != kind:
                raise ValidationError(
                    f"The file does not match its declared type ({ctype}). "
                    f"Detected: {kind}."
                )

        if kind == "pdf":
            _validate_pdf_content(f)
            return

        if kind in _PILLOW_KINDS:
            _validate_image_content(f, expected_kind=kind)

    finally:
        target = pos if pos is not None else 0
        try:
            f.seek(target)
        except (AttributeError, OSError):
            pass


def _validate_image_content(f, expected_kind):
    """
    Open, check dimensions, then force a full decode.

    verify() is deliberately NOT used: for JPEG, TIFF, WebP and BMP it
    is essentially a no-op that only reads the header, so a truncated
    JPEG passes. load() actually decodes — bounded by MAX_PIXELS, which
    is checked before the decode runs.
    """
    try:
        f.seek(0)
        with Image.open(f) as img:
            pil_format = (img.format or "").upper()
            pil_kind = PIL_FORMAT_TO_KIND.get(pil_format)
            if pil_kind is not None and pil_kind != expected_kind:
                raise ValidationError(
                    f"File content is {pil_format}, not {expected_kind}."
                )
            w, h = img.size
            if w * h > MAX_PIXELS:
                raise ValidationError(
                    f"Image has too many pixels ({w * h:,} > {MAX_PIXELS:,})."
                )
            # Force the decoder to run. On a truncated file this raises.
            img.load()
    except ValidationError:
        raise
    except _PILLOW_ERRORS as exc:
        raise ValidationError(
            f"The file is not a valid image: {exc}."
        ) from exc


def _validate_pdf_content(f):
    """
    Reject password-protected and zero-page PDFs at upload time, so the
    user gets an immediate message instead of a worker failure 30s later.
    """
    try:
        import pymupdf as fitz  # type: ignore[import-not-found]
    except ImportError:
        try:
            import fitz  # type: ignore[import-not-found]
        except ImportError:
            # PyMuPDF not available. Skip content validation; the worker
            # will raise a clear ImageDecodeError if the PDF is unusable.
            return

    try:
        pos = f.tell()
    except (AttributeError, OSError):
        pos = None

    try:
        f.seek(0)
        data = f.read()
        try:
            pdf = fitz.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise ValidationError(
                f"The file is not a valid PDF: {exc}."
            ) from exc

        with pdf:
            if not pdf.is_pdf:
                raise ValidationError("The file is not a valid PDF.")
            if pdf.page_count == 0:
                raise ValidationError("The PDF has no pages.")
            if pdf.needs_pass and not pdf.authenticate(""):
                raise ValidationError(
                    "The PDF is password-protected and cannot be read."
                )
    finally:
        target = pos if pos is not None else 0
        try:
            f.seek(target)
        except (AttributeError, OSError):
            pass


def _human(n: int) -> str:
    value: float = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"