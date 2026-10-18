"""
Step 8 — closing audit entry and workflow completion.

Runs after classify_risk. Writes the terminal audit entry and marks the
workflow COMPLETED. If this step fails, the pipeline already did its
real work — the failure is logged and completion still happens so the
customer isn't stuck staring at an IN_PROGRESS workflow.
"""
from __future__ import annotations

import logging

from celery import shared_task

from backend.audit.models import AuditLogEntry
from backend.core.workflow import mark_complete, mark_step

log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def log_audit_summary(self, parsed_doc_id, tracking_id=None):
    mark_step(tracking_id, "log_audit_summary", self.request.id)

    try:
        from backend.risk.models import RiskClassification
        from backend.verification.models import ParsedDocument

        parsed = ParsedDocument.objects.select_related(
            "ocr_result__document__customer",
        ).get(id=parsed_doc_id)
        customer = parsed.ocr_result.document.customer
        risk = RiskClassification.objects.filter(parsed_document=parsed).first()
    except Exception:
        log.exception("log_audit_summary: could not load workflow context")
        mark_complete(tracking_id)
        return parsed_doc_id

    AuditLogEntry.objects.create(
        action="kyc_workflow_completed",
        user=customer,
        success=True,
        details={
            "tracking_id": str(tracking_id) if tracking_id else None,
            "parsed_document_id": parsed.pk,
            "document_id": parsed.ocr_result.document_id,
            "risk_tier": risk.tier if risk else None,
            "final_step": "log_audit_summary",
        },
    )

    mark_complete(tracking_id)
    return parsed_doc_id