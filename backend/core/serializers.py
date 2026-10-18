# backend/core/serializers.py
from rest_framework import serializers

from .models import KYCWorkflow, WorkflowMessage


class KYCWorkflowSerializer(serializers.ModelSerializer):
    """
    Read-only projection of a KYCWorkflow — full shape.

    Every field is read-only. Workflows are created by StartKYCView and
    mutated by the Celery chain; they are never edited through the API.
    """

    reference = serializers.CharField(read_only=True)
    decided_by_username = serializers.SerializerMethodField()

    class Meta:
        model = KYCWorkflow
        fields = [
            "id",
            "tracking_id",
            "reference",
            "customer",
            "document",
            "status",
            "current_step",
            "last_error",
            "decision",
            "decision_note",
            "decided_by",
            "decided_by_username",
            "decided_at",
            "preprocess_task_id",
            "ocr_task_id",
            "classification_task_id",
            "screening_task_id",
            "evidence_score_task_id",
            "risk_classification_task_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_decided_by_username(self, obj) -> str | None:
        return obj.decided_by.username if obj.decided_by else None


class KYCWorkflowListSerializer(serializers.ModelSerializer):
    """
    Lightweight projection for list views.

    Drops the six Celery task IDs (only meaningful in detail) and
    suppresses `last_error` for non-FAILED rows so a single failed row
    on a page doesn't ship 99 blank strings.

    Exposes `decision`, `decision_note`, and `decided_at` so the
    customer dashboard can render outstanding "more information"
    requests without a second round-trip.
    """

    reference = serializers.CharField(read_only=True)
    last_error = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    document_type = serializers.SerializerMethodField()

    class Meta:
        model = KYCWorkflow
        fields = [
            "id",
            "tracking_id",
            "reference",
            "document",
            "customer_name",
            "document_type",
            "status",
            "current_step",
            "last_error",
            "decision",
            "decision_note",
            "decided_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_last_error(self, obj) -> str:
        return obj.last_error if obj.status == "FAILED" else ""

    def get_customer_name(self, obj) -> str:
        customer = getattr(obj, "customer", None)
        if customer is None:
            return "—"
        full = f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        return full or customer.username or "—"

    def get_document_type(self, obj) -> str:
        document = getattr(obj, "document", None)
        if document is None:
            return "—"
        try:
            return document.get_doc_type_display() or document.doc_type or "—"
        except AttributeError:
            return document.doc_type or "—"


class WorkflowDecisionInputSerializer(serializers.Serializer):
    """
    Payload for POST /api/workflows/<tracking_id>/decision/.

    PENDING is not a valid input — a decision is only ever set once.
    """

    decision = serializers.ChoiceField(
        choices=["APPROVED", "REJECTED", "MORE_INFO"],
    )
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, default="",
    )

    def validate_note(self, value: str) -> str:
        return (value or "").strip()

class WorkflowMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowMessage
        fields = ["id", "sender_name", "is_staff", "content", "created_at"]

    def get_sender_name(self, obj) -> str:
        if obj.is_staff:
            return "KYC Officer"
        request = self.context.get("request")
        if request and obj.sender_id == request.user.pk:
            return "You"
        return "Customer"
