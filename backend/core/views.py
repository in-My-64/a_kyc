# backend/core/views.py
import logging

from celery import chain
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.audit.models import AuditLogEntry
from backend.core.audit_tasks import log_audit_summary
from backend.core.assessment_tasks import run_sanctions_screening
from backend.risk.face_match import run_face_match
from backend.documents.models import Document
from backend.documents.tasks import preprocess_document
from backend.ocr_engine.tasks import run_ocr_task
from backend.ocr_engine.vlm.tasks import run_vlm_extraction
from backend.risk.tasks import classify_risk, compute_evidence_score
from backend.verification.tasks import create_parsed_document
from backend.verification.tasks_compare import compare_extractions

from .models import KYCWorkflow, WorkflowMessage
from .serializers import (
    WorkflowMessageSerializer,
    KYCWorkflowListSerializer,
    WorkflowDecisionInputSerializer,
)

logger = logging.getLogger(__name__)


class StartKYCView(APIView):
    """
    POST /api/start-kyc/

    Body:
      { "document_id": <int>, "reason": "<optional string>" }

    Creates a KYCWorkflow and dispatches the KYC Celery chain.
    Returns the tracking_id immediately.

    Who can call this:
      · Any authenticated user, for a document they own.
      · Staff, for any document. The new workflow belongs to the
        document's customer.

    Which statuses permit a new workflow:
      · COMPLETED — permitted.
      · FAILED    — permitted.
      · PENDING / IN_PROGRESS — rejected with 409.

    Errors:
      - 400 if document_id is missing / not a positive integer
      - 404 if the document doesn't exist (or belongs to another user
        and the requester is not staff)
      - 409 if a workflow is already PENDING/IN_PROGRESS
      - 500 if dispatch itself fails
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        document_id = self._validate_document_id(
            request.data.get("document_id"),
        )
        selfie_id = request.data.get("selfie_id")
        reason = self._clean_reason(request.data.get("reason"))

        if request.user.is_staff:
            doc = get_object_or_404(Document, id=document_id)
        else:
            doc = get_object_or_404(
                Document, id=document_id, customer=request.user,
            )

        selfie = None
        if selfie_id:
            from backend.documents.models import Selfie
            selfie = get_object_or_404(Selfie, id=selfie_id, customer=doc.customer)

        wf = self._create_workflow_or_conflict(doc.customer, doc, selfie=selfie, reason=reason)
        tid = str(wf.tracking_id)

        wf.status = "IN_PROGRESS"
        wf.current_step = "preprocess_document"
        wf.save(update_fields=["status", "current_step", "updated_at"])

        try:
            self._dispatch_chain(doc.id, tid)
        except Exception as exc:
            wf.refresh_from_db(
                fields=["status", "current_step", "last_error"],
            )

            if wf.status == "FAILED":
                logger.info(
                    "Chain raised after workflow %s recorded FAILED at "
                    "%s: %s",
                    tid, wf.current_step, exc,
                )
                return Response(
                    {
                        "tracking_id": tid,
                        "status": wf.status,
                        "current_step": wf.current_step,
                        "last_error": wf.last_error,
                    },
                    status=status.HTTP_202_ACCEPTED,
                )

            self._mark_dispatch_failed(wf, exc)
            raise

        return Response({"tracking_id": tid}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _validate_document_id(raw):
        if raw is None or raw == "":
            raise ValidationError(
                {"document_id": ["This field is required."]}
            )
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValidationError(
                {"document_id": ["Must be an integer."]}
            )
        if value <= 0:
            raise ValidationError(
                {"document_id": ["Must be a positive integer."]}
            )
        return value

    @staticmethod
    def _clean_reason(raw) -> str:
        if not isinstance(raw, str):
            return ""
        return raw.strip()[:500]

    @staticmethod
    @transaction.atomic
    def _create_workflow_or_conflict(
        customer, doc, selfie=None, reason: str = "",
    ) -> KYCWorkflow:
        Document.objects.select_for_update().only("id").get(pk=doc.pk)

        existing = KYCWorkflow.objects.filter(
            customer=customer, document=doc,
            status__in=["PENDING", "IN_PROGRESS"],
        ).first()

        if existing:
            raise WorkflowAlreadyRunning(existing)

        return KYCWorkflow.objects.create(
            customer=customer, document=doc, selfie=selfie,
            status="PENDING", current_step="created",
            re_run_reason=reason,
        )

    @staticmethod
    def _dispatch_chain(document_id, tracking_id):
        """
        KYC chain. Nine steps, in order:

          1. preprocess_document     — image cleaning
          2. run_ocr_task            — v1 whole-image OCR
          3. create_parsed_document  — create the ParsedDocument row
          4. run_vlm_extraction      — document reading (source of truth)
          5. compare_extractions     — apply the reading to ParsedDocument
          6. compute_evidence_score  — weighted scoring
          7. run_fbc_screening       — OpenSanctions + Dilisense screening
          8. classify_risk           — risk tier
          9. log_audit_summary       — closing audit entry
        """
        chain(
            preprocess_document.s(document_id, tracking_id),
            run_ocr_task.s(tracking_id),
            create_parsed_document.s(tracking_id),
            run_vlm_extraction.s(tracking_id),
            compare_extractions.s(tracking_id),
            run_face_match.s(tracking_id),
            compute_evidence_score.s(tracking_id),
            run_sanctions_screening.s(tracking_id),
            classify_risk.s(tracking_id),
            log_audit_summary.s(tracking_id),
        ).apply_async()

    @staticmethod
    def _mark_dispatch_failed(wf, exc):
        wf.status = "FAILED"
        wf.current_step = "dispatch_failed"
        wf.last_error = f"{exc.__class__.__name__}: {exc}"[:2000]
        wf.save(
            update_fields=["status", "current_step", "last_error", "updated_at"],
        )


class KYCWorkflowViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    GET /api/workflows/                            list
    GET /api/workflows/outstanding-more-info/      more-info requests awaiting response

    Scoped to the requesting user's own workflows; staff see everything.

    Query params:
      ?status=PENDING|IN_PROGRESS|COMPLETED|FAILED
      ?current_step=<step name>    exact match
      ?document=<id>                exact match
      ?decision=PENDING|APPROVED|REJECTED|MORE_INFO
      ?search=<tracking_id substring>
      ?ordering=created_at|-created_at|updated_at|-updated_at
      ?page=<int>  ?page_size=<int>
    """

    serializer_class = KYCWorkflowListSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["status", "current_step", "document", "decision"]
    search_fields = ["tracking_id"]
    ordering_fields = ["created_at", "updated_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = KYCWorkflow.objects.select_related("customer", "document")
        if not user.is_staff:
            qs = qs.filter(customer=user)
        return qs

    @action(detail=False, methods=["get"], url_path="outstanding-more-info")
    def outstanding_more_info(self, request):
        """
        MORE_INFO workflows whose customer has not yet responded.

        A workflow is *outstanding* while no newer workflow has been
        created against the same document. The moment the customer
        starts a fresh workflow (upload a new document / retry the
        same one), the request is considered answered and drops out of
        this list.

        Scoped to the requesting user. Staff see the same shape across
        every customer they can see.
        """
        user = request.user

        base = KYCWorkflow.objects.filter(decision="MORE_INFO")
        if not user.is_staff:
            base = base.filter(customer=user)

        # A subsequent workflow = a new workflow against the same
        # document, created after the officer recorded the request.
        subsequent = KYCWorkflow.objects.filter(
            customer=OuterRef("customer"),
            document=OuterRef("document"),
            created_at__gt=OuterRef("decided_at"),
        )

        qs = (
            base
            .annotate(has_subsequent=Exists(subsequent))
            .filter(has_subsequent=False)
            .select_related("customer", "document")
            .order_by("-decided_at")
        )

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class WorkflowDecisionView(APIView):
    """
    POST /api/workflows/<uuid:tracking_id>/decision/

    Body:
      { "decision": "APPROVED" | "REJECTED" | "MORE_INFO",
        "note": "<optional free text, max 2000 chars>" }

    Staff only. Terminal — the workflow must be COMPLETED and the
    decision must still be PENDING. Writes an AuditLogEntry.

    Keyed on `tracking_id` (the UUID), not the numeric PK, so the
    frontend only needs the value it already has in the URL.
    """

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, tracking_id):
        wf = get_object_or_404(KYCWorkflow, tracking_id=tracking_id)

        if wf.decision != "PENDING":
            raise ValidationError({
                "decision": [
                    f"This workflow was already decided as "
                    f"{wf.get_decision_display()} on "
                    f"{wf.decided_at:%Y-%m-%d %H:%M}."
                ]
            })

        if wf.status != "COMPLETED":
            raise ValidationError({
                "decision": [
                    "Only completed workflows can be decided. "
                    f"Current status: {wf.status}."
                ]
            })

        serializer = WorkflowDecisionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        wf.decision = data["decision"]
        wf.decision_note = data["note"]
        wf.decided_by = request.user
        wf.decided_at = timezone.now()
        wf.save(
            update_fields=[
                "decision",
                "decision_note",
                "decided_by",
                "decided_at",
                "updated_at",
            ],
        )

        AuditLogEntry.objects.create(
            action="kyc_workflow_decided",
            user=request.user,
            success=True,
            details={
                "tracking_id": str(wf.tracking_id),
                "reference": wf.reference,
                "decision": wf.decision,
                "note": wf.decision_note[:500],
            },
        )

        return Response({
            "decision": wf.decision,
            "decision_note": wf.decision_note,
            "decided_at": wf.decided_at,
            "decided_by": {
                "id": request.user.pk,
                "username": request.user.username,
            },
        })


class WorkflowAlreadyRunning(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"

    def __init__(self, existing: KYCWorkflow):
        super().__init__(
            {
                "error": "conflict",
                "message": "A workflow is already running for this document.",
                "detail": {
                    "tracking_id": str(existing.tracking_id),
                    "status": existing.status,
                    "current_step": existing.current_step,
                },
            }
        )

    def __str__(self):
        return "A workflow is already running for this document."

class WorkflowMessageView(APIView):
    """
    POST /api/workflows/<tracking_id>/messages/
    Body: { "content": "..." }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tracking_id):
        wf = get_object_or_404(KYCWorkflow, tracking_id=tracking_id)

        if not request.user.is_staff and wf.customer_id != request.user.pk:
            raise PermissionDenied("You cannot message on this workflow.")

        content = (request.data.get("content") or "").strip()
        if not content:
            raise ValidationError({"content": ["Message cannot be empty."]})

        msg = WorkflowMessage.objects.create(
            workflow=wf,
            sender=request.user,
            is_staff=request.user.is_staff,
            content=content,
        )
        return Response(
            WorkflowMessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )
