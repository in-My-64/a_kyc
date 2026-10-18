# backend/core/assessment_tasks.py
"""
Pipeline tasks for the unified Customer Assessment.
"""
from __future__ import annotations
import logging
from celery import shared_task
from django.utils import timezone

from backend.core.workflow import mark_step
from backend.screening.aggregator import screen_person
from backend.screening.models import ScreeningResult
from backend.verification.models import ParsedDocument

log = logging.getLogger(__name__)

def _split_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.strip().split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])

@shared_task(bind=True, max_retries=0)
def run_sanctions_screening(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "run_sanctions_screening", self.request.id)

    try:
        parsed = ParsedDocument.objects.select_related(
            "ocr_result__document__customer",
        ).get(id=parsed_doc_id)
    except ParsedDocument.DoesNotExist:
        log.warning("run_sanctions_screening: ParsedDocument %s missing", parsed_doc_id)
        return parsed_doc_id

    # ---- Screening (aggregator: OpenSanctions + Dilisense) ---------------
    if not parsed.name:
        status = "FLAGGED"
        details = {
            "providers": [],
            "provider": "none",
            "reason": "no_name",
            "message": "No name extracted; screening could not run.",
        }
    else:
        first, last = _split_name(parsed.name)
        try:
            outcome = screen_person(
                full_name=parsed.name,
                first_name=first,
                last_name=last,
                birth_date=parsed.dob.isoformat() if parsed.dob else None,
                nationality=parsed.nationality,
            )
            status = outcome.status
            details = {
                "providers": outcome.providers,
                "provider": "+".join(outcome.providers) if outcome.providers else "none",
                "status": outcome.status,
                "match_count": len(outcome.matches),
                "matches": [
                    {
                        "entity_id": m.entity_id,
                        "caption": m.caption,
                        "score": round(m.score, 4),
                        "schema": m.schema,
                        "topics": m.topics,
                        "datasets": m.datasets,
                        "raw": m.raw,
                    }
                    for m in outcome.matches
                ],
                "per_provider": outcome.per_provider,
            }
            if outcome.error:
                details["error"] = outcome.error
        except Exception as exc:
            log.exception("run_sanctions_screening: screening call failed")
            status = "FLAGGED"
            details = {"providers": [], "provider": "none", "reason": "transport_error", "error": str(exc)[:500]}

    ScreeningResult.objects.update_or_create(
        parsed_document=parsed,
        defaults={"status": status, "details": details},
    )
    
    return parsed_doc_id
