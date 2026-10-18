import logging

from django.utils import timezone

from .models import KYCWorkflow

logger = logging.getLogger(__name__)

TASK_ID_FIELDS = {
    "preprocess_document": "preprocess_task_id",
    "run_ocr_task": "ocr_task_id",
    "classify_document": "classification_task_id",
    "screen_document": "screening_task_id",
    "compute_evidence_score": "evidence_score_task_id",
    "classify_risk": "risk_classification_task_id",
}

# NOTE: all three helpers below write via QuerySet.update(), which
# bypasses Model.save() entirely. Consequences:
#   * auto_now on `updated_at` does not fire, so we set it explicitly.
#   * post_save signals on KYCWorkflow are not emitted — don't add one
#     and expect it to see these writes.


def mark_step(tracking_id, step_name, task_id=None):
    if not tracking_id:
        return
    update = {
        "status": "IN_PROGRESS",
        "current_step": step_name,
        "updated_at": timezone.now(),
    }
    field = TASK_ID_FIELDS.get(step_name)
    if field and task_id:
        update[field] = task_id
    KYCWorkflow.objects.filter(tracking_id=tracking_id).update(**update)


def mark_complete(tracking_id):
    if not tracking_id:
        return
    KYCWorkflow.objects.filter(tracking_id=tracking_id).update(
        status="COMPLETED",
        current_step="done",
        last_error="",
        updated_at=timezone.now(),
    )


def mark_failed(tracking_id, step_name, exc):
    if not tracking_id:
        return
    if exc is None:
        error_text = "Unknown failure"
    else:
        error_text = f"{exc.__class__.__name__}: {exc}"[:2000]

    KYCWorkflow.objects.filter(tracking_id=tracking_id).update(
        status="FAILED",
        current_step=f"failed_{step_name}",
        last_error=error_text,
        updated_at=timezone.now(),
    )
    logger.warning("workflow %s failed at %s: %s", tracking_id, step_name, exc)