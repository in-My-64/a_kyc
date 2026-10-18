import logging
import os
import tempfile
from decimal import Decimal

import cv2
import pytesseract
from celery import shared_task
from django.conf import settings

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step

from .models import OCRResult

logger = logging.getLogger(__name__)

_TRANSIENT = (OSError,)


def _resolve_ocr_image(ocr) -> str:
    """Binarized image produced by preprocessing. Preferred for OCR when upright."""
    if ocr.ocr_image_path:
        candidate = os.path.join(settings.MEDIA_ROOT, ocr.ocr_image_path)
        if os.path.exists(candidate):
            return candidate
        logger.warning(
            "OCRResult %s: ocr_image_path=%r missing on disk",
            ocr.pk, ocr.ocr_image_path,
        )
    doc = ocr.document
    if doc.processed_file:
        return doc.processed_file.path
    raise ValueError(f"OCRResult {ocr.pk} has no usable processed image")


def _resolve_original(ocr) -> str | None:
    """Original uploaded file. Full detail, EXIF orientation already applied."""
    doc = ocr.document
    if doc.file:
        try:
            path = doc.file.path
            if os.path.exists(path):
                return path
        except (ValueError, NotImplementedError):
            pass
    return None


def _detect_rotate(path: str) -> int:
    """
    Return the clockwise rotation Tesseract's OSD recommends for `path`,
    or 0 if unknown / OSD unavailable.
    """
    try:
        osd = pytesseract.image_to_osd(path)
    except pytesseract.TesseractError as exc:
        logger.warning("OSD failed for %s: %s", path, exc)
        return 0
    except Exception as exc:
        logger.warning("OSD unexpected failure for %s: %s", path, exc)
        return 0

    for line in osd.splitlines():
        if line.lower().startswith("rotate:"):
            try:
                return int(line.split(":", 1)[1].strip())
            except (ValueError, IndexError):
                return 0
    return 0


def _rotate_to_temp(path: str, degrees: int) -> str | None:
    """Rotate `path` by `degrees` clockwise. Returns temp path or None."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        return None

    if degrees == 90:
        out = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif degrees == 180:
        out = cv2.rotate(img, cv2.ROTATE_180)
    elif degrees == 270:
        out = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    else:
        return None

    fd, out_path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    if not cv2.imwrite(out_path, out):
        try:
            os.unlink(out_path)
        except OSError:
            pass
        return None
    return out_path


def _reconstruct_lines(data: dict) -> tuple[str, list[int]]:
    text_col = data.get("text") or []
    conf_col = data.get("conf") or []
    level_col = data.get("level") or []
    block_col = data.get("block_num") or []
    par_col = data.get("par_num") or []
    line_col = data.get("line_num") or []

    lines: list[str] = []
    confidences: list[int] = []
    current_key: tuple[int, int, int] | None = None
    current_words: list[str] = []

    def _flush():
        if current_words:
            lines.append(" ".join(current_words))

    for word, conf, level, block, par, line in zip(
        text_col, conf_col, level_col, block_col, par_col, line_col,
    ):
        try:
            lv = int(level)
            cf = int(conf)
            key = (int(block), int(par), int(line))
        except (TypeError, ValueError):
            continue
        if lv != 5:
            continue
        w = (word or "").strip()
        if not w:
            continue
        if key != current_key:
            _flush()
            current_words = []
            current_key = key
        current_words.append(w)
        if cf >= 0:
            confidences.append(cf)

    _flush()
    return "\n".join(lines), confidences


def _run_tesseract(path: str) -> tuple[str, list[int]]:
    data = pytesseract.image_to_data(
        path, output_type=pytesseract.Output.DICT,
    )
    return _reconstruct_lines(data)


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def run_ocr_task(self, ocr_result_id, tracking_id=None):
    mark_step(tracking_id, "run_ocr_task", self.request.id)

    try:
        ocr = OCRResult.objects.select_related("document").get(id=ocr_result_id)
    except OCRResult.DoesNotExist as exc:
        raise ValueError(
            f"OCRResult {ocr_result_id} does not exist"
        ) from exc

    ocr_image = _resolve_ocr_image(ocr)
    original = _resolve_original(ocr)

    # 1. Try to detect rotation on the ORIGINAL upload. The binarized
    #    image has already been through deskew+crop+threshold, and on a
    #    sideways source those steps mangle the text. OSD on the
    #    original sees the real layout.
    working_path = ocr_image
    temp_created = False
    rotation_applied = 0

    if original:
        degrees = _detect_rotate(original)
        if degrees:
            rotated = _rotate_to_temp(original, degrees)
            if rotated:
                working_path = rotated
                temp_created = True
                rotation_applied = degrees
                logger.info(
                    "OSD: rotating %s by %d° for OCR", original, degrees,
                )

    # 2. Run OCR on the working path.
    try:
        text, confs = _run_tesseract(working_path)
    except pytesseract.TesseractNotFoundError as exc:
        if temp_created:
            try:
                os.unlink(working_path)
            except OSError:
                pass
        raise RuntimeError(
            "Tesseract binary not found on PATH. Install tesseract-ocr."
        ) from exc
    except pytesseract.TesseractError as exc:
        if temp_created:
            try:
                os.unlink(working_path)
            except OSError:
                pass
        raise ValueError(
            f"Tesseract could not process {working_path!r}: {exc}"
        ) from exc

    # 3. If we used a rotated original and got a real result, keep it.
    #    If the OSD path returned nothing (empty text) AND we have a
    #    binarized image that we didn't try, fall back to it.
    if not text.strip() and temp_created and working_path != ocr_image:
        try:
            fallback_text, fallback_confs = _run_tesseract(ocr_image)
        except pytesseract.TesseractError:
            fallback_text, fallback_confs = "", []
        if fallback_text.strip():
            text, confs = fallback_text, fallback_confs

    if temp_created:
        try:
            os.unlink(working_path)
        except OSError:
            pass

    avg = sum(confs) / len(confs) if confs else 0.0

    ocr.extracted_text = text
    ocr.confidence = Decimal(str(round(avg, 2)))
    ocr.details = {
        "word_count": sum(len(line.split()) for line in text.splitlines()),
        "line_count": len(text.splitlines()),
        "n_conf": len(confs),
        "rotation_applied": rotation_applied,
        "used_original_for_ocr": rotation_applied > 0,
    }
    ocr.save(update_fields=[
        "extracted_text",
        "confidence",
        "details",
        "updated_at",
    ])

    return ocr.id