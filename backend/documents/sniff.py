"""
Content sniffing shared between upload validation and preprocessing.

This module is the single source of truth for:

  * Which magic bytes identify which file format.
  * Which MIME types map to which sniffed kind.
  * Which PIL format strings correspond to which sniffed kind.

The upload boundary and the preprocessor MUST route on the same signal.
Content-Type is attacker-controlled; sniffed magic bytes are not.
"""

from __future__ import annotations

SNIFF_WINDOW = 64

# PDF header tolerance. The spec allows `%PDF-` anywhere in the first
# 1024 bytes, but that is a polyglot surface. For KYC we require the
# marker within the first 16 bytes — enough for a BOM or a small
# producer prefix, not enough for a meaningful polyglot payload.
PDF_HEADER_MAX_OFFSET = 16

# ISO/IEC 14496-12 brands that indicate HEIF/HEIC.
HEIF_BRANDS = frozenset(
    b"heic heix hevc hevx mif1 msf1 heim heis hevm hevs".split()
)

# Valid BMP DIB header sizes. A two-byte `BM` prefix alone is too weak —
# an executable can trivially start with `BM`. The DIB header size at
# offset 14 must be one of these.
_BMP_DIB_HEADER_SIZES = frozenset({12, 40, 52, 56, 64, 108, 124})

# Kinds we accept for KYC. Anything else is rejected even if sniffed.
ACCEPTED_KINDS = frozenset({"pdf", "jpeg", "png", "tiff", "heic", "webp", "bmp"})


def sniff_kind(head: bytes) -> str | None:
    """
    Return a normalized format identifier for the leading bytes of a
    file, or None if unrecognised.

    Possible return values: "pdf", "jpeg", "png", "tiff", "heic",
    "webp", "bmp", "gif".
    """
    if not head:
        return None

    # --- PDF ----------------------------------------------------------
    window = head[: PDF_HEADER_MAX_OFFSET + 5]
    if b"%PDF-" in window:
        return "pdf"

    # --- ISO BMFF (HEIC / HEIF) --------------------------------------
    # Layout: [4-byte size]["ftyp"][4-byte brand][...].
    if len(head) >= 12 and head[4:8] == b"ftyp":
        if head[8:12] in HEIF_BRANDS:
            return "heic"

    # --- JPEG --------------------------------------------------------
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"

    # --- PNG ---------------------------------------------------------
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"

    # --- TIFF --------------------------------------------------------
    if head[:4] in (b"II\x2a\x00", b"MM\x00\x2a"):
        return "tiff"

    # --- WebP --------------------------------------------------------
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"

    # --- BMP ---------------------------------------------------------
    # Require both the `BM` prefix AND a valid DIB header size at
    # offset 14. Without the second check, any file starting with `BM`
    # would sniff as BMP.
    if len(head) >= 18 and head.startswith(b"BM"):
        import struct as _struct
        try:
            (dib_size,) = _struct.unpack_from("<I", head, 14)
        except _struct.error:
            dib_size = None
        if dib_size in _BMP_DIB_HEADER_SIZES:
            return "bmp"

    # --- GIF (recognised, but not accepted for KYC) ------------------
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "gif"

    return None


# MIME type → sniffed kind. Used to confirm a declared MIME type
# matches the actual bytes. An empty or `application/octet-stream`
# declaration is treated as "no hint" and the sniff stands alone.
_MIME_TO_KIND = {
    "application/pdf": "pdf",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/tiff": "tiff",
    "image/heic": "heic",
    "image/heif": "heic",
    "image/webp": "webp",
    "image/bmp": "bmp",
}

NO_MIME_HINT = frozenset({
    "",
    "application/octet-stream",
    "binary/octet-stream",
    "application/x-unknown",
})


def kind_for_mime(mime: str) -> str | None:
    """Return the sniff kind expected for a declared MIME type, or None."""
    return _MIME_TO_KIND.get((mime or "").lower())


def mime_is_hintless(mime: str) -> bool:
    """True if the declared MIME conveys no useful information."""
    return (mime or "").lower() in NO_MIME_HINT


# PIL format string → sniffed kind. Used to confirm that Pillow decoded
# the file as the format we expected, not "some image Pillow knows".
PIL_FORMAT_TO_KIND = {
    "JPEG": "jpeg",
    "PNG": "png",
    "TIFF": "tiff",
    "WEBP": "webp",
    "BMP": "bmp",
    "HEIF": "heic",
    "HEIC": "heic",
}


def read_head(path, n: int = SNIFF_WINDOW) -> bytes:
    """Read the first `n` bytes of a file, or b"" on error."""
    try:
        with open(path, "rb") as f:
            return f.read(n)
    except OSError:
        return b""