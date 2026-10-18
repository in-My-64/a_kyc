"""
Document image preprocessing.

Produces TWO derived images per upload:

  - "clean": deskewed, denoised, contrast-normalized, still natural
    greyscale. Suitable for downstream visual checks.
  - "ocr": the clean variant additionally binarized via Otsu.

A quality check (blur + brightness) runs BEFORE expensive processing.
Blur is a WARNING (recorded on the metadata); brightness extremes are a
HARD rejection — a pure-white or pure-black image has no recoverable
content.

Quality metrics are measured on a fixed-size proxy, not the full image.
This is both a memory guard (Laplacian on a 50 MP image allocates
~400 MB) and a correctness improvement — the same physical blur
produces different Laplacian variance at different capture resolutions,
so a fixed proxy makes the threshold comparable across devices.

Input format support
--------------------
`_load_grayscale` dispatches on content sniffing (see `sniff.py`). Only
kinds in sniff.ACCEPTED_KINDS are handled; anything else raises rather
than falling through to a wider codec set:

  * PDF → rasterize page 1 via PyMuPDF, forced to filetype="pdf" so
    MuPDF's format auto-detection (which would open EPUB, SVG, XPS)
    cannot be abused.
  * HEIC → pillow-heif.
  * TIFF → PIL, so multi-frame files can be counted and 16-bit modes
    are handled without clipping.
  * Everything else → cv2.imread(), and only for sniffed kinds in the
    allowlist.

Outputs are written via tempfile.mkstemp + os.replace, so a mid-
pipeline failure never leaves a truncated file at the destination.
"""

import logging
import os
import tempfile

import cv2
import numpy as np

from .sniff import ACCEPTED_KINDS, read_head, sniff_kind

logger = logging.getLogger(__name__)

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
    _HEIF_AVAILABLE = True
except ImportError:
    _HEIF_AVAILABLE = False


class ImageDecodeError(Exception):
    """The input could not be decoded as an image or PDF."""


class ImageProcessingError(Exception):
    """OpenCV failed during processing, after a successful decode."""


class ImageQualityError(Exception):
    """Input failed the brightness gate. Carries the measured metrics."""

    def __init__(self, message, metrics):
        super().__init__(message)
        self.metrics = metrics


DEFAULT_MIN_BLUR_VARIANCE = 60.0
DEFAULT_MIN_BRIGHTNESS = 40.0
DEFAULT_MAX_BRIGHTNESS = 235.0

# PDF-specific gate relaxations. A vector-rendered page is mostly flat
# white, so the Laplacian variance is dominated by a few sharp edges and
# the mean brightness sits near 255. A scanned PDF (a photo embedded in
# a PDF container) gets the standard gate.
PDF_VECTOR_BLUR_FACTOR = 0.3
PDF_VECTOR_MAX_BRIGHTNESS = 254.0

# Edge length of the square proxy on which quality metrics are
# measured. 1000 px is large enough to preserve text-edge structure,
# small enough that the Laplacian allocation is bounded.
METRIC_PROXY_EDGE = 1000

# Downscale above this on the longest edge before the working pipeline.
MAX_WORKING_EDGE = 2000

# Digital (vector) PDFs carry no sensor noise, so denoising is
# unnecessary and actively harmful — it smears small print. Keep more
# resolution and skip the denoise step.
PDF_VECTOR_WORKING_EDGE = 3000

MIN_OUTPUT_EDGE = 200

PDF_RASTER_DPI = 300
MAX_RASTER_PIXELS = 50_000_000


# ---------------------------------------------------------------------------
# PDF loader
# ---------------------------------------------------------------------------

def _import_fitz():
    try:
        import pymupdf as fitz  # type: ignore[import-not-found]
        return fitz
    except ImportError:
        pass
    try:
        import fitz  # type: ignore[import-not-found]
        return fitz
    except ImportError as exc:
        raise ImageDecodeError(
            "PDF support requires PyMuPDF. Install it with "
            "`pip install pymupdf` and restart the worker."
        ) from exc


def _load_pdf(path, dpi=PDF_RASTER_DPI):
    """
    Rasterize page 1 of `path`. Returns (gray, pages_ignored, is_scanned).

    `filetype="pdf"` forces the PDF interpreter — without it, MuPDF's
    auto-detection would happily open EPUB, SVG, XPS and image formats
    based on content, so a file that passes our sniff could be parsed as
    something entirely different.
    """
    fitz = _import_fitz()

    try:
        pdf = fitz.open(path, filetype="pdf")
    except Exception as exc:
        raise ImageDecodeError(f"Could not open PDF: {path} ({exc})") from exc

    with pdf:
        if not pdf.is_pdf:
            raise ImageDecodeError(f"Not a PDF: {path}")
        if pdf.page_count == 0:
            raise ImageDecodeError(f"PDF has no pages: {path}")
        if pdf.needs_pass and not pdf.authenticate(""):
            raise ImageDecodeError(f"PDF is password-protected: {path}")

        try:
            page = pdf.load_page(0)
        except Exception as exc:
            raise ImageDecodeError(
                f"Could not load PDF page 1: {path} ({exc})"
            ) from exc

        # Scanned vs. vector heuristic: a page with embedded images and
        # very little extractable text is a scan.
        try:
            has_images = bool(page.get_images())
            text_len = len((page.get_text() or "").strip())
        except Exception:
            has_images = False
            text_len = 0
        is_scanned = has_images and text_len < 50

        rect = page.rect
        if rect.width <= 0 or rect.height <= 0:
            raise ImageDecodeError(f"PDF page 1 has no area: {path}")

        scale = dpi / 72.0
        target_pixels = (rect.width * scale) * (rect.height * scale)
        if target_pixels > MAX_RASTER_PIXELS:
            shrink = (MAX_RASTER_PIXELS / target_pixels) ** 0.5
            dpi = max(int(dpi * shrink), 72)
            scale = dpi / 72.0

        try:
            try:
                pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
            except TypeError:
                matrix = fitz.Matrix(scale, scale)
                pix = page.get_pixmap(
                    matrix=matrix, colorspace=fitz.csGRAY,
                )
        except Exception as exc:
            raise ImageDecodeError(
                f"Could not rasterize PDF page 1: {path} ({exc})"
            ) from exc

        pages_ignored = max(pdf.page_count - 1, 0)

    expected = pix.height * pix.width * pix.n
    if len(pix.samples) != expected:
        raise ImageDecodeError(
            f"Unexpected PDF raster size for {path}: "
            f"got {len(pix.samples)} bytes, expected {expected}"
        )

    array = np.frombuffer(pix.samples, dtype=np.uint8)
    if pix.n == 1:
        gray = array.reshape(pix.height, pix.width).copy()
    else:
        shaped = array.reshape(pix.height, pix.width, pix.n).copy()
        gray = cv2.cvtColor(shaped, cv2.COLOR_RGB2GRAY)

    return gray, pages_ignored, is_scanned


# ---------------------------------------------------------------------------
# PIL-backed loaders (HEIC, TIFF)
# ---------------------------------------------------------------------------

def _pil_to_gray_array(img):
    """
    Convert a PIL image to a 2-D uint8 grayscale array.

    Handles 8-bit modes directly; for 16-bit and floating-point modes,
    scales by the observed data range rather than assuming a bit
    alignment. A right-aligned 12-bit scanner produces data in
    [0, 4095]; `>> 8` would collapse that to [0, 15] (nearly black),
    which the quality gate would then reject as underexposed.
    """
    mode = img.mode
    if mode in ("I;16", "I;16B", "I;16L", "I;16N", "I;16S"):
        array = np.array(img, dtype=np.uint16)
        peak = int(array.max()) if array.size else 0
        if peak == 0:
            return array.astype(np.uint8)
        if peak <= 255:
            # Already in 8-bit range despite the 16-bit container.
            return array.astype(np.uint8)
        # Scale by observed peak so both left- and right-aligned data
        # map cleanly into 0-255.
        scale = 255.0 / float(peak)
        return (array.astype(np.float32) * scale).round().astype(np.uint8)

    if mode == "I":
        array = np.array(img, dtype=np.int32)
        peak = int(array.max()) if array.size else 0
        lo = int(array.min()) if array.size else 0
        if peak <= 255 and lo >= 0:
            return np.clip(array, 0, 255).astype(np.uint8)
        span = peak - lo
        if span <= 0:
            return np.zeros(array.shape, dtype=np.uint8)
        scaled = (array - lo) / float(span) * 255.0
        return scaled.round().astype(np.uint8)

    if mode == "F":
        array = np.array(img, dtype=np.float32)
        array = array - np.nanmin(array)
        peak = np.nanmax(array)
        if peak > 0:
            array = array / peak
        return np.nan_to_num(array * 255).round().astype(np.uint8)

    return np.array(img.convert("L"), dtype=np.uint8)


def _load_heic(path):
    if not _HEIF_AVAILABLE:
        raise ImageDecodeError(
            "HEIC/HEIF support requires pillow-heif. Install it with "
            "`pip install pillow-heif` and restart the worker."
        )

    from PIL import Image, ImageOps

    try:
        with Image.open(path) as img:
            img = ImageOps.exif_transpose(img)
            return _pil_to_gray_array(img), 0
    except Exception as exc:
        raise ImageDecodeError(
            f"Could not decode HEIC file: {path} ({exc})"
        ) from exc


def _load_tiff(path):
    from PIL import Image, ImageOps

    try:
        with Image.open(path) as img:
            n_frames = getattr(img, "n_frames", 1)
            img = ImageOps.exif_transpose(img)
            array = _pil_to_gray_array(img)
    except Exception as exc:
        raise ImageDecodeError(
            f"Could not decode TIFF file: {path} ({exc})"
        ) from exc

    return array, max(n_frames - 1, 0)


def _load_via_opencv(path):
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ImageDecodeError(
            f"Could not decode image as a valid file: {path}"
        )
    return img, 0


def _load_grayscale(path):
    """
    Load a file as a 2-D uint8 grayscale array.

    Returns (gray, source_kind, pages_ignored, is_scanned) where
    source_kind is "pdf", "heic", or "image". Uses the same `sniff_kind`
    as the upload validator.
    """
    kind = sniff_kind(read_head(path, 64))

    if kind is None or kind not in ACCEPTED_KINDS:
        # Do NOT fall through to cv2.imread. cv2's codec set is wider
        # than our allowlist (it decodes e.g. some camera RAW formats),
        # and every fall-through is a code path the validator did not
        # bless.
        raise ImageDecodeError(
            f"Unsupported or unrecognised file type ({kind or 'unknown'}): {path}"
        )

    if kind == "pdf":
        gray, pages_ignored, is_scanned = _load_pdf(path)
        return gray, "pdf", pages_ignored, is_scanned
    if kind == "heic":
        gray, pages_ignored = _load_heic(path)
        return gray, "heic", pages_ignored, False
    if kind == "tiff":
        gray, pages_ignored = _load_tiff(path)
        return gray, "image", pages_ignored, False

    gray, pages_ignored = _load_via_opencv(path)
    return gray, "image", pages_ignored, False


# ---------------------------------------------------------------------------
# Pipeline stages
# ---------------------------------------------------------------------------

def _downscale_to_edge(gray, max_edge):
    """Return (image, was_downscaled)."""
    h, w = gray.shape[:2]
    longest = max(h, w)
    if longest <= max_edge:
        return gray, False
    scale = max_edge / float(longest)
    new_size = (int(w * scale), int(h * scale))
    return cv2.resize(gray, new_size, interpolation=cv2.INTER_AREA), True


def _measurement_proxy(gray, edge=METRIC_PROXY_EDGE):
    """Return a proxy sized for stable quality metrics — cheap and
    resolution-independent."""
    h, w = gray.shape[:2]
    longest = max(h, w)
    if longest <= edge:
        return gray
    scale = edge / float(longest)
    return cv2.resize(
        gray, (int(w * scale), int(h * scale)),
        interpolation=cv2.INTER_AREA,
    )


def compute_quality_metrics(gray):
    """Laplacian variance + mean brightness on a fixed-size proxy."""
    proxy = _measurement_proxy(gray)
    blur_variance = cv2.Laplacian(proxy, cv2.CV_64F).var()
    brightness = float(np.mean(proxy))
    return {
        "blur_variance": round(float(blur_variance), 2),
        "brightness": round(brightness, 2),
    }


def check_quality(
    metrics,
    min_blur=DEFAULT_MIN_BLUR_VARIANCE,
    min_brightness=DEFAULT_MIN_BRIGHTNESS,
    max_brightness=DEFAULT_MAX_BRIGHTNESS,
):
    """
    Evaluate quality metrics. Returns a list of warning codes.

    Blur is a WARNING, not a rejection. A blurry-but-legible photo can
    still be processed — SuperOCR's voting across preprocessing variants
    handles mild blur, and the v1 whole-image OCR handles the rest.
    Rejecting outright gives the customer an error with no path forward,
    when a low-confidence extraction plus a flag on the workflow would
    have been more useful. Real phone photos of ID cards commonly score
    between 30 and 60 variance; the 60 threshold was excluding the
    majority of legitimate uploads.

    Brightness extremes remain a HARD rejection: a pure-white or
    pure-black image has no recoverable content — every pixel carries
    no information, and no amount of preprocessing can invent it.
    """
    warnings: list[str] = []
    if metrics["blur_variance"] < min_blur:
        warnings.append("image_blurry")
    if not (min_brightness <= metrics["brightness"] <= max_brightness):
        raise ImageQualityError(
            f"Image brightness out of acceptable range "
            f"(value={metrics['brightness']}, "
            f"expected {min_brightness}-{max_brightness})",
            metrics,
        )
    return warnings


def _deskew(gray):
    """
    Rotate so the dominant text angle is horizontal.

    Uses Otsu binarization, then picks the polarity with the *smaller*
    foreground area as the "ink" side. A fixed BINARY_INV assumes the
    document is lighter than its background; a document on a dark table
    (or a photo where the page appears dark) inverts that assumption and
    the resulting mask covers the whole frame, collapsing the angle to 0.

    Rotates on an expanded canvas so a non-trivial angle doesn't crop
    the corners; the downstream crop stage trims the added border.

    Returns (image, was_rotated, angle_degrees).
    """
    if gray.size == 0:
        return gray, False, 0.0

    try:
        _, bin_a = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU,
        )
    except cv2.error:
        return gray, False, 0.0

    # Pick the polarity where the "on" pixels are the minority — ink on
    # paper, regardless of whether the paper is lighter or darker.
    fg_a = int(np.count_nonzero(bin_a))
    fg_b = bin_a.size - fg_a
    thresh = bin_a if fg_a <= fg_b else cv2.bitwise_not(bin_a)

    coords = cv2.findNonZero(thresh)
    if coords is None or len(coords) < 50:
        return gray, False, 0.0

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90

    if abs(angle) < 0.5:
        return gray, False, 0.0

    h, w = gray.shape[:2]
    cx, cy = w / 2.0, h / 2.0
    matrix = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)

    cos = abs(matrix[0, 0])
    sin = abs(matrix[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    matrix[0, 2] += (new_w / 2.0) - cx
    matrix[1, 2] += (new_h / 2.0) - cy

    try:
        rotated = cv2.warpAffine(
            gray,
            matrix,
            (new_w, new_h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
    except cv2.error:
        return gray, False, 0.0

    return rotated, True, round(float(angle), 2)


def _crop_to_document(gray):
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(
        edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
    )
    if not contours:
        return gray, False

    largest = max(contours, key=cv2.contourArea)
    frame_area = gray.shape[0] * gray.shape[1]
    if cv2.contourArea(largest) < 0.2 * frame_area:
        return gray, False

    x, y, w, h = cv2.boundingRect(largest)
    if min(w, h) < MIN_OUTPUT_EDGE:
        return gray, False

    return gray[y : y + h, x : x + w], True


def _write_image(path, image):
    ok = cv2.imwrite(str(path), image)
    if not ok:
        raise IOError(f"Failed to write image to {path}")


def _write_outputs_atomically(clean_path, clean_img, ocr_path, ocr_img):
    """
    Write both outputs via tempfile.mkstemp, then os.replace into place.

    - Temp names are unique per call (mkstemp), so two concurrent tasks
      on the same document can't collide on a fixed `.tmp.png` name.
    - Paths are passed through `os.fspath` so callers can pass str or
      Path interchangeably.
    - The suffix is forced to `.png`; OpenCV's encoder selection looks
      at the extension, so a temp name ending in the destination's
      extension (which could be anything) would write the wrong codec.
    - The two os.replace calls are not jointly atomic. A crash between
      them leaves a fresh clean file with the previous OCR file. That's
      a degraded state, not a corrupt one — the previous OCR file is
      still readable. The Document is marked processed only after this
      function returns.
    """
    clean_path = os.fspath(clean_path)
    ocr_path = os.fspath(ocr_path)

    clean_dir = os.path.dirname(clean_path) or "."
    ocr_dir = os.path.dirname(ocr_path) or "."

    clean_fd, clean_tmp = tempfile.mkstemp(
        dir=clean_dir, prefix=".tmp-", suffix=".png",
    )
    os.close(clean_fd)
    ocr_fd, ocr_tmp = tempfile.mkstemp(
        dir=ocr_dir, prefix=".tmp-", suffix=".png",
    )
    os.close(ocr_fd)

    try:
        _write_image(clean_tmp, clean_img)
        _write_image(ocr_tmp, ocr_img)
        os.replace(clean_tmp, clean_path)
        os.replace(ocr_tmp, ocr_path)
    except Exception:
        for tmp in (clean_tmp, ocr_tmp):
            try:
                os.unlink(tmp)
            except FileNotFoundError:
                pass
        raise


def preprocess_image(
    input_path,
    clean_output_path,
    ocr_output_path,
    min_blur=DEFAULT_MIN_BLUR_VARIANCE,
    min_brightness=DEFAULT_MIN_BRIGHTNESS,
    max_brightness=DEFAULT_MAX_BRIGHTNESS,
):
    """
    Full preprocessing pipeline. Writes both output images atomically
    and returns metadata. Raises ImageDecodeError, ImageProcessingError,
    or ImageQualityError (brightness only) on unusable input.
    """
    # 1. Load. Everything past this point is wrapped in a single
    #    cv2.error handler, so no cv2 exception escapes unlabelled.
    gray, source_kind, pages_ignored, is_scanned = _load_grayscale(
        input_path,
    )

    # 2. Quality check on the source, using the source-appropriate
    #    thresholds. Blur → warning; brightness extremes → raise.
    original_metrics = compute_quality_metrics(gray)
    if source_kind == "pdf" and not is_scanned:
        # Vector-rendered page: mostly flat white, sharp text. Loosen
        # the blur threshold so a legitimate digital PDF isn't flagged
        # as "too uniform".
        quality_warnings = check_quality(
            original_metrics,
            min_blur=min_blur * PDF_VECTOR_BLUR_FACTOR,
            min_brightness=min_brightness,
            max_brightness=PDF_VECTOR_MAX_BRIGHTNESS,
        )
        denoise = False
        working_edge = PDF_VECTOR_WORKING_EDGE
    else:
        quality_warnings = check_quality(
            original_metrics, min_blur, min_brightness, max_brightness,
        )
        denoise = True
        working_edge = MAX_WORKING_EDGE

    # 3. Processing. Single try/except around the whole block so no
    #    raw cv2.error escapes from resize, metrics, minAreaRect, or
    #    the contour stage. ImageQualityError is raised upstream and is
    #    not caught here.
    try:
        working, was_downscaled = _downscale_to_edge(gray, working_edge)
        deskewed, was_deskewed, angle_deg = _deskew(working)
        cropped, was_cropped = _crop_to_document(deskewed)

        if denoise:
            denoised = cv2.fastNlMeansDenoising(cropped, h=10)
        else:
            denoised = cropped

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        clean = clahe.apply(denoised)
        _, binarized = cv2.threshold(
            clean, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU,
        )
    except cv2.error as exc:
        raise ImageProcessingError(
            f"OpenCV error processing {input_path}: {exc}"
        ) from exc

    _write_outputs_atomically(
        clean_output_path, clean, ocr_output_path, binarized,
    )

    return {
        **original_metrics,
        "warnings": quality_warnings,
        "source_kind": source_kind,
        "pages_ignored": pages_ignored,
        "is_scanned_pdf": is_scanned if source_kind == "pdf" else None,
        "was_downscaled": was_downscaled,
        "was_deskewed": was_deskewed,
        "deskew_angle_deg": angle_deg,
        "was_cropped": was_cropped,
        "denoised": denoise,
        "working_edge": working_edge,
        "output_shape": list(clean.shape[:2]),
    }


# ---------------------------------------------------------------------------
# Colour loader (used by superocr, which needs the raw photo, not the
# grayscale/binarized derivatives)
# ---------------------------------------------------------------------------

def load_bgr(path):
    """
    Load a file as a 3-channel BGR uint8 array. Same sniffing and allowlist as
    `_load_grayscale`, so any file the upload validator accepts is loadable here
    (PDF page 1, HEIC, TIFF, and everything cv2 handles). Sources with no colour
    information (PDF raster, 16-bit TIFF) come back as gray replicated to BGR.

    Raises ImageDecodeError; never falls through to a wider codec set.
    """
    kind = sniff_kind(read_head(path, 64))
    if kind is None or kind not in ACCEPTED_KINDS:
        raise ImageDecodeError(
            f"Unsupported or unrecognised file type ({kind or 'unknown'}): {path}"
        )

    if kind == "pdf":
        gray, _pages_ignored, _is_scanned = _load_pdf(path)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    if kind in ("heic", "tiff"):
        if kind == "heic" and not _HEIF_AVAILABLE:
            raise ImageDecodeError(
                "HEIC/HEIF support requires pillow-heif. Install it with "
                "`pip install pillow-heif` and restart the worker."
            )
        from PIL import Image, ImageOps

        try:
            with Image.open(path) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode.startswith("I") or img.mode == "F":
                    # 16-bit / float modes: reuse the range-aware gray conversion.
                    return cv2.cvtColor(_pil_to_gray_array(img), cv2.COLOR_GRAY2BGR)
                rgb = np.array(img.convert("RGB"), dtype=np.uint8)
        except Exception as exc:
            raise ImageDecodeError(
                f"Could not decode {kind.upper()} file: {path} ({exc})"
            ) from exc
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise ImageDecodeError(f"Could not decode image as a valid file: {path}")
    return img