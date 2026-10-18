"""
Celery task: run a VLM against the raw document image and stash the
result on ParsedDocument.corrections.vlm_raw.

Three modes, checked in order:

  1. CACHE — media/vlm_cache/vlm_<sha256>.json exists. Used for offline
     extraction. Lets a machine without a GPU run the pipeline against
     pre-computed VLM outputs.
  2. LIVE  — a VLM backend is configured and reachable. Called directly.
     If the transport fails, the task raises VLMUnreachableError so the
     whole workflow fails loudly rather than silently degrading.
  3. SKIP  — no cache, no backend configured. Task records a skip notice
     and the pipeline continues.

The task does NOT overwrite ParsedDocument fields — the compare step
decides which engine wins.

Error classification
--------------------
Three failure kinds are recorded on `vlm_raw.kind` and reflected in the
raised exception:

  network — couldn't reach the endpoint at all (connection refused,
            DNS failure, timeout, mid-request reset).
  config  — endpoint answered, but rejected the request as configured
            ("model not found", "does not support images"). The fix is
            on the operator's side: pull the model, fix the tag, point
            OLLAMA_URL at the right instance.
  data    — endpoint answered with content we can't parse as the JSON
            object we asked for.

Only `network` raises VLMUnreachableError. The distinction exists
because a bare 404 from Ollama is a config problem, not a network
problem, and reporting it as "vision service unreachable" sends an
operator to check the wrong thing.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from celery import shared_task
from django.conf import settings

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.verification.models import ParsedDocument

from .exceptions import VLMUnreachableError
from .factory import get_vlm_backend
from .prompts import PROMPT

log = logging.getLogger(__name__)

# Transport-level failure: we never got a usable HTTP response. Any
# match here means "the endpoint could not be reached or did not
# answer". HTTP status codes deliberately do NOT appear here — a
# well-formed 4xx/5xx is the service answering, not failing to.
_TRANSPORT_ERROR_MARKERS = (
    "ConnectionError",
    "Connection refused",
    "Connection reset",
    "Max retries exceeded",
    "timed out",
    "Timeout",
    "Name or service not known",
    "Temporary failure in name resolution",
    "No route to host",
    "Network is unreachable",
    "RemoteDisconnected",
    "SSLError",
)

# Config-level failure: the endpoint answered with a valid HTTP
# response, but the request itself was rejected as unservable — missing
# model, unsupported modality, bad tag. The endpoint is fine; the
# deployment is wrong. Mirrors OllamaVLMBackend.CONFIG_ERROR_MARKERS.
_CONFIG_ERROR_MARKERS = (
    "not found",
    "does not support",
    "no such model",
    "unknown model",
    "invalid model",
)


def _is_transport_error(error: str) -> bool:
    return any(marker in error for marker in _TRANSPORT_ERROR_MARKERS)


def _is_config_error(error: str) -> bool:
    e = error.lower()
    return any(marker.lower() in e for marker in _CONFIG_ERROR_MARKERS)


def _classify(error: str) -> str:
    if _is_transport_error(error):
        return "network"
    if _is_config_error(error):
        return "config"
    return "data"


def _cache_dir() -> Path:
    return Path(settings.MEDIA_ROOT) / "vlm_cache"


def _load_raw_bytes(path: str) -> bytes:
    """Return raw PNG bytes for the VLM (normalizes HEIC/TIFF/PDF)."""
    import cv2
    from backend.documents.preprocess_utils import load_bgr

    bgr = load_bgr(path)
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise ValueError(f"could not encode image for VLM: {path}")
    return buf.tobytes()


def _try_cache(file_hash: str) -> dict | None:
    """Look up a pre-computed VLM extraction by file hash."""
    if not file_hash:
        return None
    candidate = _cache_dir() / f"vlm_{file_hash}.json"
    if not candidate.exists():
        return None
    try:
        return json.loads(candidate.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("VLM cache read failed for %s: %s", candidate, exc)
        return None


@shared_task(bind=True, base=WorkflowTrackingTask, max_retries=0)
def run_vlm_extraction(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "run_vlm_extraction", self.request.id)

    try:
        parsed = ParsedDocument.objects.select_related(
            "ocr_result__document",
        ).get(id=parsed_doc_id)
    except ParsedDocument.DoesNotExist:
        log.warning("run_vlm_extraction: ParsedDocument %s missing", parsed_doc_id)
        return parsed_doc_id

    document = parsed.ocr_result.document
    corrections = dict(parsed.corrections or {})

    # ---- 1. Cache -------------------------------------------------------
    cached = _try_cache(document.file_hash)
    if cached and cached.get("fields"):
        corrections["vlm_raw"] = {
            "status": "ok",
            "backend": cached.get("backend", "cache"),
            "model": cached.get("model", "unknown"),
            "source": "cache",
            "elapsed_s": cached.get("elapsed_s"),
            "fields": {
                k: cached["fields"].get(k)
                for k in (
                    "id_number", "surname", "first_name", "dob",
                    "village_of_origin", "place_of_birth", "date_of_issue",
                )
            },
        }
        parsed.corrections = corrections
        parsed.save(update_fields=["corrections", "updated_at"])
        log.info(
            "run_vlm_extraction: cache hit for document %s (hash %s)",
            document.pk, document.file_hash[:12],
        )
        return parsed_doc_id

    # ---- 2. Live backend -----------------------------------------------
    backend = get_vlm_backend()

    if backend is None:
        corrections["vlm_raw"] = {
            "status": "skipped",
            "reason": "no cache and no VLM backend configured",
        }
        parsed.corrections = corrections
        parsed.save(update_fields=["corrections", "updated_at"])
        return parsed_doc_id

    # Backend IS configured. If anything below fails, we raise so the
    # workflow fails — the caller asked for the VLM to be part of the
    # pipeline and we cannot honour that.

    try:
        image_bytes = _load_raw_bytes(document.file.path)
    except Exception as exc:
        log.exception("run_vlm_extraction: could not load image")
        corrections["vlm_raw"] = {
            "status": "error",
            "kind": "data",
            "backend": backend.name,
            "source": "live",
            "error": f"image load failed: {exc}",
        }
        parsed.corrections = corrections
        parsed.save(update_fields=["corrections", "updated_at"])
        raise ValueError(f"VLM image load failed for document {document.pk}: {exc}")

    result = backend.extract(image_bytes, PROMPT)

    if result.error:
        kind = _classify(result.error)
        corrections["vlm_raw"] = {
            "status": "error",
            "kind": kind,
            "backend": result.backend or backend.name,
            "model": result.model,
            "source": "live",
            "error": result.error,
        }
        parsed.corrections = corrections
        parsed.save(update_fields=["corrections", "updated_at"])

        log.warning("VLM extraction failed (%s): %s", kind, result.error)

        if kind == "network":
            raise VLMUnreachableError(
                f"Vision service unreachable "
                f"({result.backend or backend.name}): {result.error}"
            )
        if kind == "config":
            raise RuntimeError(
                f"Vision backend misconfigured "
                f"({result.backend or backend.name}): {result.error}"
            )
        raise RuntimeError(
            f"Vision service returned unusable output "
            f"({result.backend or backend.name}): {result.error}"
        )

    corrections["vlm_raw"] = {
        "status": "ok",
        "backend": result.backend,
        "model": result.model,
        "source": "live",
        "fields": {
            k: result.fields.get(k)
            for k in (
                "id_number", "surname", "first_name", "dob",
                "village_of_origin", "place_of_birth", "date_of_issue",
            )
        },
    }
    parsed.corrections = corrections
    parsed.save(update_fields=["corrections", "updated_at"])
    return parsed_doc_id