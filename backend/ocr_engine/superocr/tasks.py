"""
Celery entrypoint that wires SuperOCR into the existing document pipeline.

Drop-in replacement for the old `classify_document`: same signature, same
side effect (saves a ParsedDocument), same retry behaviour. Needs the raw
image, not just OCR text, so it reads straight from the document's file
field instead of an existing OCRResult.
"""
from __future__ import annotations

import cv2
import numpy as np
from celery import shared_task

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.documents.preprocess_utils import _load_grayscale
from backend.ocr_engine.models import OCRResult
from backend.verification.models import ParsedDocument

from .adapter import apply_to_parsed
from .factory import get_engine

_TRANSIENT = (OSError,)


def _load_image(document) -> np.ndarray:
    """
    Decode the document into a BGR image, whatever the source format.

    Routes through documents.preprocess_utils._load_grayscale so PDF,
    HEIC and TIFF go down the same verified path as everywhere else in
    the pipeline. cv2.imdecode alone cannot handle any of those.

    The returned array is a single-channel grayscale; we promote it to
    3-channel BGR because every downstream stage (dewarp, enhance, the
    engines) works on BGR.
    """
    gray, _kind, _pages_ignored, _is_scanned = _load_grayscale(
        document.file.path,
    )
    if gray is None or gray.size == 0:
        raise ValueError(f"could not decode image for document {document.id}")
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _fill_from_ocr_text(parsed, ocr, issues: list[str]) -> None:
    """
    Fall back to the v1 whole-image OCR extractors when SuperOCR's card
    detection fails.

    The v1 `OCRResult.extracted_text` was already written by run_ocr_task
    earlier in the chain. On PDFs and heavily blurred photos, the whole-
    image Tesseract read frequently succeeds where SuperOCR's per-field
    layout boxes fail — because whole-image OCR does not need to find the
    card first.

    Only fills fields SuperOCR left empty. A value SuperOCR DID extract
    (even if from a wrong box) is preserved, because the alternative is
    silent overwrite of a correct read by a worse one.
    """
    text = (ocr.extracted_text or "").strip()
    if not text:
        return

    # Deferred import: verification.tasks imports ocr_engine.models, so a
    # module-level import here would be circular. At call time everything
    # is loaded and the import is free.
    from backend.verification.tasks import (
        _extract_field,
        extract_name,
        extract_date_near,
        extract_nationality,
        is_plausible_dob,
    )

    recovered: list[str] = []

    if not parsed.id_number:
        id_number, _, _ = _extract_field(
            text, parsed.doc_type or "unknown", {}, "id_number",
        )
        if id_number:
            parsed.id_number = id_number
            recovered.append("id_number")

    if not parsed.name:
        name = extract_name(text)
        if name:
            parsed.name = name
            recovered.append("name")

    if not parsed.dob:
        dob = extract_date_near(text, ["BIRTH", "DOB"])
        if dob and is_plausible_dob(dob):
            parsed.dob = dob
            recovered.append("dob")

    if not parsed.nationality:
        nationality = extract_nationality(text)
        if nationality:
            parsed.nationality = nationality
            recovered.append("nationality")

    # If an ID was recovered, that's a strong national_id signal; mirror
    # SuperOCR's inference so the two paths produce identical shapes.
    if parsed.id_number:
        parsed.doc_type = "national_id"
        if not parsed.nationality:
            parsed.nationality = "ZW"
            recovered.append("nationality_inferred_from_doc_type")

    if recovered:
        issues.append(f"recovered_from_ocr_text:{','.join(recovered)}")


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def classify_document_v2(self, ocr_result_id, tracking_id=None):
    mark_step(tracking_id, "classify_document_v2", self.request.id)

    try:
        ocr = OCRResult.objects.select_related("document").get(id=ocr_result_id)
    except OCRResult.DoesNotExist as exc:
        raise ValueError(f"OCRResult {ocr_result_id} does not exist") from exc

    parsed, _ = ParsedDocument.objects.get_or_create(
        ocr_result=ocr,
        defaults={
            "doc_type": getattr(ocr.document, "doc_type", "unknown") or "unknown",
        },
    )

    image = _load_image(ocr.document)
    result = get_engine().run(image)
    issues = apply_to_parsed(parsed, result)

    # Fall back when SuperOCR could not locate the card. Its layout boxes
    # are card-relative; without a detected card they land on meaningless
    # pixels and produce confident garbage. The v1 whole-image extractors
    # do not need a detected card, and on PDFs and blurry photos they
    # routinely outperform SuperOCR's per-field read.
    if not result.card_found:
        _fill_from_ocr_text(parsed, ocr, issues)

    if not parsed.id_number and not parsed.name:
        issues.append("extraction_empty: no id_number and no name extracted")

    parsed.verification_issues = issues
    parsed.save(update_fields=[
        "doc_type", "id_number", "name", "dob", "expiry", "nationality",
        "corrections", "verification_issues", "updated_at",
    ])
    return parsed.id