import logging
import os

import numpy as np
import cv2
from celery import shared_task
from django.conf import settings
from django.db import InterfaceError, OperationalError
from django.utils import timezone

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.documents.preprocess_utils import load_bgr
from backend.verification.models import ParsedDocument

from .models import FaceMatchResult

log = logging.getLogger(__name__)
_TRANSIENT = (OSError, OperationalError, InterfaceError)
_APP = None


def _get_insightface():
    global _APP
    if _APP is None:
        from insightface.app import FaceAnalysis
        model_name = getattr(settings, "FACE_MATCH_MODEL", "buffalo_l")
        log.info("Loading InsightFace model: %s", model_name)
        _APP = FaceAnalysis(name=model_name)
        _APP.prepare(
            ctx_id=getattr(settings, "FACE_MATCH_CTX_ID", -1),
            det_size=(640, 640),
        )
    return _APP


def _save_face_crop(bgr, bbox, prefix: str) -> str | None:
    """Crop the detected face, save it to MEDIA_ROOT, return the relative path."""
    try:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        pad = 24
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(bgr.shape[1], x2 + pad)
        y2 = min(bgr.shape[0], y2 + pad)
        crop = bgr[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        rel_path = f"face_crops/{prefix}_{int(timezone.now().timestamp() * 1000)}.jpg"
        abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        ok = cv2.imwrite(abs_path, crop)
        if not ok:
            log.warning("cv2.imwrite returned False for %s", abs_path)
            return None
        return rel_path
    except Exception:
        log.exception("Failed to save crop for %s", prefix)
        return None


def _extract_face(image_path: str, prefix: str) -> tuple[np.ndarray | None, str | None, dict]:
    """Detect the largest face, return (embedding, crop_path, meta)."""
    app = _get_insightface()
    bgr = load_bgr(image_path)
    faces = app.get(bgr)

    if not faces:
        return None, None, {"faces_detected": 0}

    def _area(f):
        x1, y1, x2, y2 = f.bbox
        return (x2 - x1) * (y2 - y1)

    face = max(faces, key=_area)
    crop_path = _save_face_crop(bgr, face.bbox, prefix)

    return face.normed_embedding, crop_path, {
        "faces_detected": len(faces),
        "det_score": float(face.det_score),
        "estimated_age": int(face.age) if hasattr(face, "age") else None,
        "estimated_gender": "Male" if getattr(face, "gender", 0) == 1 else "Female",
    }


def _liveness_check(selfie_path: str) -> tuple[bool, float | None, dict]:
    """Passive liveness. Stub: always True for now."""
    return True, None, {"liveness_backend": "stub"}


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
)
def run_face_match(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "run_face_match", self.request.id)

    try:
        parsed = ParsedDocument.objects.select_related(
            "ocr_result__document__customer",
        ).get(id=parsed_doc_id)
    except ParsedDocument.DoesNotExist as exc:
        raise ValueError(f"ParsedDocument {parsed_doc_id} does not exist") from exc

    from backend.core.models import KYCWorkflow
    wf = KYCWorkflow.objects.filter(tracking_id=tracking_id).first()

    if not wf or not wf.selfie_id:
        log.warning("run_face_match: workflow %s has no selfie", tracking_id)
        FaceMatchResult.objects.update_or_create(
            parsed_document=parsed,
            defaults={
                "decision": "FAIL",
                "similarity": 0.0,
                "threshold": 0.0,
                "liveness_passed": False,
                "details": {"reason": "no_selfie_linked"},
            },
        )
        return parsed_doc_id

    selfie_path = wf.selfie.file.path
    doc_path = parsed.ocr_result.document.file.path

    # Liveness first
    liveness_passed, liveness_score, liveness_meta = _liveness_check(selfie_path)
    if not liveness_passed:
        FaceMatchResult.objects.update_or_create(
            parsed_document=parsed,
            defaults={
                "decision": "FAIL",
                "similarity": 0.0,
                "threshold": 0.0,
                "liveness_passed": False,
                "liveness_score": liveness_score,
                "details": {"reason": "liveness_failed", **liveness_meta},
            },
        )
        return parsed_doc_id

    # Extract faces
    selfie_emb, selfie_crop, selfie_meta = _extract_face(selfie_path, "selfie")
    id_emb, id_crop, id_meta = _extract_face(doc_path, "id")

    log.info(
        "run_face_match: selfie_faces=%s id_faces=%s",
        selfie_meta.get("faces_detected", 0),
        id_meta.get("faces_detected", 0),
    )

    if selfie_emb is None or id_emb is None:
        reason = "no_face_in_selfie" if selfie_emb is None else "no_face_in_document"
        FaceMatchResult.objects.update_or_create(
            parsed_document=parsed,
            defaults={
                "decision": "FAIL",
                "similarity": 0.0,
                "threshold": 0.0,
                "liveness_passed": liveness_passed,
                "liveness_score": liveness_score,
                "selfie_crop_path": selfie_crop,
                "id_crop_path": id_crop,
                "details": {
                    "reason": reason,
                    "selfie": selfie_meta,
                    "document": id_meta,
                    **liveness_meta,
                },
            },
        )
        return parsed_doc_id

    # Similarity + decision
    similarity = float(np.dot(selfie_emb, id_emb))
    threshold = float(getattr(settings, "FACE_MATCH_THRESHOLD", 0.45))
    review_floor = threshold * getattr(settings, "FACE_MATCH_REVIEW_RATIO", 0.75)

    if similarity >= threshold:
        decision = "MATCH"
        reason = f"Similarity {similarity:.3f} >= threshold {threshold:.3f}"
    elif similarity >= review_floor:
        decision = "REVIEW"
        reason = f"Similarity {similarity:.3f} in review band [{review_floor:.3f}, {threshold:.3f})"
    else:
        decision = "FAIL"
        reason = f"Similarity {similarity:.3f} < review floor {review_floor:.3f}"

    age_warning = None
    if parsed.dob and selfie_meta.get("estimated_age"):
        from datetime import date
        real_age = date.today().year - parsed.dob.year
        est_age = selfie_meta["estimated_age"]
        if abs(real_age - est_age) > 15:
            age_warning = f"ID says {real_age}, AI estimates {est_age}."
            if decision == "MATCH" and similarity < 0.60:
                decision = "REVIEW"
                reason = f"Borderline match ({similarity:.3f}); {age_warning}"

    # 1:N deduplication
    dup_id = None
    dup_sim = None
    if decision != "FAIL":
        past = FaceMatchResult.objects.exclude(
            parsed_document=parsed,
        ).exclude(
            selfie_embedding__isnull=True,
        ).values_list(
            "selfie_embedding",
            "parsed_document__ocr_result__document__customer_id",
        )
        best_sim = 0.0
        best_customer = None
        for past_emb, past_customer in past:
            if past_customer == wf.customer_id:
                continue
            sim = float(np.dot(selfie_emb, np.array(past_emb)))
            if sim > best_sim:
                best_sim = sim
                best_customer = past_customer
        if best_sim >= 0.65:
            dup_id = best_customer
            dup_sim = best_sim
            if decision == "MATCH":
                decision = "REVIEW"
            reason = f"{reason}; possible duplicate of customer #{dup_id} ({best_sim:.3f})"

    FaceMatchResult.objects.update_or_create(
        parsed_document=parsed,
        defaults={
            "decision": decision,
            "similarity": similarity,
            "threshold": threshold,
            "fmr_target": getattr(settings, "FACE_MATCH_FMR_TARGET", "1e-4"),
            "liveness_passed": liveness_passed,
            "liveness_score": liveness_score,
            "model_name": getattr(settings, "FACE_MATCH_MODEL", "buffalo_l"),
            "model_version": "v0.8",
            "selfie_crop_path": selfie_crop,
            "id_crop_path": id_crop,
            "selfie_embedding": selfie_emb.tolist(),
            "id_embedding": id_emb.tolist(),
            "duplicate_customer_id": dup_id,
            "duplicate_similarity": dup_sim,
            "details": {
                "reason": reason,
                "age_warning": age_warning,
                "selfie": selfie_meta,
                "document": id_meta,
                **liveness_meta,
            },
        },
    )

    log.info(
        "run_face_match: parsed=%s similarity=%.3f decision=%s crop_selfie=%s crop_id=%s",
        parsed.pk, similarity, decision, bool(selfie_crop), bool(id_crop),
    )
    return parsed_doc_id
