# backend/verification/tasks_compare.py
"""
Celery task: apply the vision model's extraction to ParsedDocument.

The classical OCR engines (v1 whole-image, SuperOCR per-field) no
longer contribute to the parsed fields. Their outputs are still
produced by earlier tasks in the chain for diagnostic and evidence-
scoring purposes, but arbitration has been removed: whatever the
vision model returned is what the customer record gets.

If the vision model did not produce a usable result, the workflow
fails here. There is no silent fallback — an empty extraction is a
signal, not a state to paper over.

Naming note: this module and task are still called
`compare_extractions` for chain compatibility. Nothing is being
compared anymore; the name is a historical artefact.
"""
from __future__ import annotations

import logging
from datetime import datetime

from celery import shared_task

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from .models import ParsedDocument

log = logging.getLogger(__name__)

# Defaults inferred from the document type. A Zimbabwe national ID is
# issued to a Zimbabwean citizen, so the nationality field is set when
# the extraction pipeline classifies the document as a national_id.
#
# This mirrors the inference the SuperOCR adapter used to perform
# (backend/verification/superocr/adapter.py) before that pipeline was
# removed from the chain. Kept here so the same default survives.
_NATIONALITY_BY_DOC_TYPE: dict[str, str] = {
    "national_id": "ZW",
}


def _parse_dob(raw):
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            continue
    return None


@shared_task(bind=True, base=WorkflowTrackingTask, max_retries=0)
def compare_extractions(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "compare_extractions", self.request.id)

    try:
        parsed = ParsedDocument.objects.select_related("ocr_result").get(
            id=parsed_doc_id,
        )
    except ParsedDocument.DoesNotExist:
        log.warning("compare_extractions: ParsedDocument %s missing", parsed_doc_id)
        return parsed_doc_id

    corrections = dict(parsed.corrections or {})
    raw = corrections.get("vlm_raw") or {}

    if raw.get("status") != "ok":
        # The vision step didn't produce a result. Do not silently
        # fall back to classical engines; raise so the workflow is
        # marked FAILED with a clear reason.
        reason = raw.get("error") or raw.get("status") or "no result"
        raise ValueError(f"document reading unavailable: {reason}")

    fields = raw.get("fields") or {}

    # Snapshot what was on the row before we overwrite it. Useful for
    # the officer view's "before / after" panel and for support
    # investigations.
    corrections["pre_apply"] = {
        "id_number": parsed.id_number,
        "name": parsed.name,
        "dob": parsed.dob.isoformat() if parsed.dob else None,
        "nationality": parsed.nationality,
    }

    parsed.id_number = fields.get("id_number") or None

    # The vision model returns first_name and surname separately. Join
    # in English order (given, then family) to match what the rest of
    # the pipeline and UI expect.
    name_parts = [
        p for p in (fields.get("first_name"), fields.get("surname")) if p
    ]
    parsed.name = " ".join(name_parts).strip() or None

    parsed.dob = _parse_dob(fields.get("dob"))

    if parsed.id_number:
        parsed.doc_type = "national_id"

    # Nationality: prefer whatever the vision model produced. If the
    # model returned nothing AND the document was classified as a
    # national_id, fall back to the doc-type default. This restores
    # the 5-point nationality contribution to the evidence score for
    # every ZW national ID.
    nationality = (fields.get("nationality") or "").strip() or None
    if nationality:
        parsed.nationality = nationality
    elif parsed.doc_type in _NATIONALITY_BY_DOC_TYPE:
        parsed.nationality = _NATIONALITY_BY_DOC_TYPE[parsed.doc_type]

    # Expose a neutral extraction block. The customer's UI and the
    # officer's review page read from here, never from vlm_raw.
    corrections["extraction"] = {
        "fields": {
            k: fields.get(k)
            for k in (
                "id_number",
                "first_name",
                "surname",
                "dob",
                "village_of_origin",
                "place_of_birth",
                "date_of_issue",
            )
        },
        "applied_at": datetime.utcnow().isoformat(),
    }

    parsed.corrections = corrections
    parsed.save(
        update_fields=[
            "id_number",
            "name",
            "dob",
            "doc_type",
            "nationality",
            "corrections",
            "updated_at",
        ]
    )

    log.info(
        "compare_extractions: applied document_reader output for parsed %s "
        "(id_number=%s, name=%s, nationality=%s)",
        parsed.pk,
        bool(parsed.id_number),
        bool(parsed.name),
        parsed.nationality,
    )
    return parsed_doc_id