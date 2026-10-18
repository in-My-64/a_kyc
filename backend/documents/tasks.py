import os

from celery import shared_task
from django.conf import settings
from django.core.files import File

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.ocr_engine.models import OCRResult
from .models import Document
from .preprocess_utils import (
    ImageDecodeError,
    ImageQualityError,
    preprocess_image,
)


# Transient errors worth retrying. Deterministic failures — missing
# document, unreadable image, failed quality gate — are raised by the
# task but NOT retried; three attempts at a blurry photo is wasted work
# and only delays the workflow being marked FAILED.
_TRANSIENT = (IOError, OSError, ConnectionError, TimeoutError)


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def preprocess_document(self, document_id, tracking_id=None):
    mark_step(tracking_id, "preprocess_document", self.request.id)

    # --- Load --------------------------------------------------------------
    try:
        doc = Document.objects.get(id=document_id)
    except Document.DoesNotExist:
        raise ValueError(f"Document {document_id} does not exist")

    if not doc.file:
        raise ValueError(f"Document {document_id} has no file")

    # --- Derive output paths ----------------------------------------------
    # Storage-relative names (what FileField.name expects). Never absolute
    # filesystem paths — those break under S3/GCS and produce broken .url.
    src_abs = doc.file.path
    base = os.path.splitext(os.path.basename(src_abs))[0]
    clean_rel = f"processed/{base}_clean.png"
    ocr_rel = f"processed/{base}_ocr.png"
    clean_abs = os.path.join(settings.MEDIA_ROOT, clean_rel)
    ocr_abs = os.path.join(settings.MEDIA_ROOT, ocr_rel)
    os.makedirs(os.path.dirname(clean_abs), exist_ok=True)

    # --- Run the pipeline --------------------------------------------------
    # ImageDecodeError / ImageQualityError propagate straight through —
    # they are not in _TRANSIENT and so are not retried.
    metadata = preprocess_image(src_abs, clean_abs, ocr_abs)

    # --- Persist -----------------------------------------------------------
    # The files are already on disk at clean_rel / ocr_rel. Assign the
    # names directly — do NOT call .save() again, which would route the
    # bytes through the storage backend a second time and, because the
    # file already exists, produce a random-suffixed duplicate.
    doc.preprocessing_meta = metadata
    doc.processed_file.name = clean_rel
    doc.save(update_fields=["processed_file", "preprocessing_meta"])

    # Idempotent under retries: get_or_create rather than create.
    ocr, created = OCRResult.objects.get_or_create(
        document=doc,
        defaults={"ocr_image_path": ocr_rel},
    )
    if not created and getattr(ocr, "ocr_image_path", None) != ocr_rel:
        ocr.ocr_image_path = ocr_rel
        ocr.save(update_fields=["ocr_image_path"])

    return ocr.id