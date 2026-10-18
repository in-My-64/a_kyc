# backend/core/views_status.py
from rest_framework import permissions
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import KYCWorkflow


class WorkflowStatusView(APIView):
    """
    GET /api/status/<uuid:tracking_id>/

    Returns the workflow state plus everything the run produced.
    Staff can view any workflow; non-staff only their own.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, tracking_id):
        qs = KYCWorkflow.objects.all()
        if not request.user.is_staff:
            qs = qs.filter(customer=request.user)

        wf = qs.filter(tracking_id=tracking_id).first()
        if wf is None:
            raise NotFound("Workflow not found.")

        is_staff = request.user.is_staff

        return Response({
            "tracking_id": str(wf.tracking_id),
            "reference": wf.reference,
            "document_id": wf.document_id,
            "selfie_id": wf.selfie_id,
            "customer_id": wf.customer_id,
            "customer_name": (
                f"{wf.customer.first_name} {wf.customer.last_name}".strip()
                or wf.customer.username
            ),
            "status": wf.status,
            "current_step": wf.current_step,
            "last_error": wf.last_error,
            "task_ids": {
                "preprocess": wf.preprocess_task_id,
                "ocr": wf.ocr_task_id,
                "classification": wf.classification_task_id,
                "screening": wf.screening_task_id,
                "evidence_score": wf.evidence_score_task_id,
                "risk_classification": wf.risk_classification_task_id,
            },
            "messages": [
                {
                    "id": m.pk,
                    "sender_name": "KYC Officer" if m.is_staff else ("You" if m.sender_id == request.user.pk else "Customer"),
                    "is_staff": m.is_staff,
                    "content": m.content,
                    "created_at": m.created_at,
                }
                for m in wf.messages.all()
            ],
            "decision": {
                "value": wf.decision,
                "note": wf.decision_note,
                "decided_at": wf.decided_at,
                "decided_by_username": (
                    wf.decided_by.username if wf.decided_by else None
                ),
            },
            "created_at": wf.created_at,
            "updated_at": wf.updated_at,
            "screening_report": self._screening_report(wf),
            "face_match": self._face_match(wf),
            "identity": self._identity(wf),
            "risk_classification": self._risk(wf),
            "evidence_score": self._evidence(wf),
            "verification_issues": self._verification_issues(wf),
            "extraction_detail": (
                self._extraction_detail(wf) if is_staff else None
            ),
        })

    # ------------------------------------------------------------------
    # FBC report
    # ------------------------------------------------------------------


    def _face_match(self, wf):
        from backend.risk.models import FaceMatchResult
        parsed = self._latest_parsed(wf)
        if not parsed: return None
        fm = getattr(parsed, "face_match", None)
        if not fm: return None
        
        return {
            "decision": fm.decision,
            "similarity": fm.similarity,
            "threshold": fm.threshold,
            "fmr_target": fm.fmr_target,
            "liveness_passed": fm.liveness_passed,
            "liveness_score": fm.liveness_score,
            "model_name": fm.model_name,
            "model_version": fm.model_version,
            "duplicate_customer_id": fm.duplicate_customer_id,
            "duplicate_similarity": fm.duplicate_similarity,
            "details": fm.details,
            "selfie_crop_url": f"/api/media/{fm.selfie_crop_path}" if fm.selfie_crop_path else None,
            "id_crop_url": f"/api/media/{fm.id_crop_path}" if fm.id_crop_path else None,
            "created_at": fm.created_at,
        }

    def _identity(self, wf):
        parsed = self._latest_parsed(wf)
        if not parsed: return None
        return {
            "id_number": parsed.id_number,
            "name": parsed.name,
            "dob": parsed.dob,
            "nationality": parsed.nationality,
            "doc_type": parsed.doc_type,
        }

    def _screening_report(self, wf):
        parsed = self._latest_parsed(wf)
        if not parsed:
            return None
        sr = getattr(parsed, "screening_result", None)
        if sr is None:
            return None
        return self._screening_payload(sr)

    @staticmethod
    def _screening_payload(sr):
        details = sr.details or {}
        return {
            "id": sr.id,
            "status": sr.status,
            "provider": details.get("provider", "opensanctions+dilisense"),
            "providers": details.get("providers", []),
            "match_count": details.get("match_count", 0),
            "matches": details.get("matches", []),
            "parsed_query": details.get("parsed_query"),
            "per_provider": details.get("per_provider", {}),
            "error": details.get("error"),
            "created_at": sr.created_at,
        }

    # ------------------------------------------------------------------
    # Parsed-document lookups
    # ------------------------------------------------------------------

    @staticmethod
    def _latest_parsed(wf):
        from backend.verification.models import ParsedDocument

        if wf.document_id is None:
            return None
        return (
            ParsedDocument.objects
            .filter(ocr_result__document_id=wf.document_id)
            .order_by("-created_at")
            .first()
        )

    def _risk(self, wf):
        from backend.risk.models import RiskClassification

        parsed = self._latest_parsed(wf)
        if parsed is None:
            return None

        rc = RiskClassification.objects.filter(parsed_document=parsed).first()
        if rc is None:
            return None

        return {
            "tier": rc.tier,
            "reason": list(rc.reason or []),
            "created_at": rc.created_at,
            "updated_at": rc.updated_at,
        }

    def _evidence(self, wf):
        from backend.risk.models import EvidenceScore

        parsed = self._latest_parsed(wf)
        if parsed is None:
            return None

        ev = EvidenceScore.objects.filter(parsed_document=parsed).first()
        if ev is None:
            return None

        return {
            "score": str(ev.score),
            "breakdown": ev.breakdown or {},
        }

    def _verification_issues(self, wf) -> list[str]:
        parsed = self._latest_parsed(wf)
        if parsed is None:
            return []
        return list(parsed.verification_issues or [])

    def _extraction_detail(self, wf):
        parsed = self._latest_parsed(wf)
        if parsed is None:
            return None

        corr = parsed.corrections or {}
        extraction = corr.get("extraction")
        if not extraction:
            return None

        return {
            "fields": extraction.get("fields") or {},
            "applied_at": extraction.get("applied_at"),
            "pre_apply": corr.get("pre_apply"),
        }