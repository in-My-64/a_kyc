# backend/screening/tasks.py
"""
Screening task — OpenSanctions + Dilisense.

The aggregator runs every configured provider and merges results. If
only one provider is configured, that one runs. If neither, the task
records FLAGGED with `no_screening_provider_configured`.
"""
from __future__ import annotations

import logging

from celery import shared_task
from django.conf import settings
from django.db import InterfaceError, OperationalError

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.verification.models import ParsedDocument

from .aggregator import screen_person
from .models import ScreeningResult

logger = logging.getLogger(__name__)

_TRANSIENT = (OperationalError, InterfaceError, ConnectionError, TimeoutError)


def _split_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.strip().split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
)
def screen_document(self, parsed_doc_id, tracking_id=None):
    """MUST return the same id it was handed (chain contract)."""
    mark_step(tracking_id, "screen_document", self.request.id)

    parsed = ParsedDocument.objects.get(id=parsed_doc_id)

    if not parsed.name:
        ScreeningResult.objects.update_or_create(
            parsed_document=parsed,
            defaults={
                "status": "FLAGGED",
                "details": {
                    "providers": [],
                    "reason": "no_name",
                    "message": "No name extracted from the document; "
                               "screening could not be performed.",
                },
            },
        )
        logger.info("screen_document: parsed=%s skipped (no name)", parsed.pk)
        return parsed_doc_id

    first, last = _split_name(parsed.name)

    outcome = screen_person(
        full_name=parsed.name,
        first_name=first,
        last_name=last,
        birth_date=parsed.dob.isoformat() if parsed.dob else None,
        nationality=parsed.nationality,
    )

    matches = [
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
    ]

    details: dict = {
        "providers": outcome.providers,
        "provider": "+".join(outcome.providers) if outcome.providers else "none",
        "status": outcome.status,
        "match_count": len(matches),
        "matches": matches,
        "per_provider": outcome.per_provider,
    }
    if outcome.error:
        details["error"] = outcome.error

    ScreeningResult.objects.update_or_create(
        parsed_document=parsed,
        defaults={"status": outcome.status, "details": details},
    )

    logger.info(
        "screen_document: parsed=%s status=%s providers=%s matches=%d",
        parsed.pk, outcome.status, outcome.providers, len(matches),
    )
    return parsed_doc_id