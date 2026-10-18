# backend/core/models.py
import uuid

from django.conf import settings
from django.db import models


class KYCWorkflow(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
    ]

    DECISION_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("MORE_INFO", "More information requested"),
    ]

    tracking_id = models.UUIDField(
        default=uuid.uuid4, editable=False, unique=True,
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="kyc_workflows",
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kyc_workflows",
    )
    selfie = models.ForeignKey(
        "documents.Selfie",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kyc_workflows",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="PENDING",
    )
    current_step = models.CharField(max_length=50, blank=True, null=True)
    last_error = models.TextField(blank=True, default="")

    # Free-form note attached when this workflow was started as a
    # re-run of a previous one — populated from the optional `reason`
    # field on POST /api/start-kyc/. Empty for first-time submissions.
    # Length capped at the view layer (500 chars) so a malformed
    # client can't write unbounded text into the audit trail.
    re_run_reason = models.CharField(max_length=500, blank=True, default="")

    # ------------------------------------------------------------------
    # Officer decision
    #
    # Set exactly once by an officer. Never written by the pipeline.
    # Only applicable after the workflow reaches COMPLETED. Once set,
    # the decision is terminal — the API rejects further updates.
    # ------------------------------------------------------------------
    decision = models.CharField(
        max_length=16,
        choices=DECISION_CHOICES,
        default="PENDING",
        db_index=True,
    )
    decision_note = models.TextField(blank=True, default="")
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_workflows",
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    preprocess_task_id = models.CharField(max_length=255, blank=True, null=True)
    ocr_task_id = models.CharField(max_length=255, blank=True, null=True)
    screening_task_id = models.CharField(max_length=255, blank=True, null=True)
    classification_task_id = models.CharField(max_length=255, blank=True, null=True)
    evidence_score_task_id = models.CharField(max_length=255, blank=True, null=True)
    risk_classification_task_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["-created_at"]),
            models.Index(fields=["decision"]),
        ]

    def __str__(self):
        return f"KYCWorkflow({self.tracking_id}, {self.status})"

    @property
    def reference(self) -> str:
        """
        Human-readable reference like "KYC-2026-0042".

        Derived — not stored. The `id` column is already monotonic, so
        we get a stable sequential number without a second column, a
        migration, or a unique constraint to maintain. The year comes
        from `created_at`, which is set by auto_now_add on first save.

        Used everywhere a customer or officer sees the workflow. The
        underlying `tracking_id` UUID stays the routing key so URLs and
        API calls remain opaque and unguessable.
        """
        year = self.created_at.year if self.created_at else "----"
        pk = self.pk or 0
        return f"KYC-{year}-{pk:04d}"

class WorkflowMessage(models.Model):
    """
    A single message in the two-way thread between the customer and the officer.
    """
    workflow = models.ForeignKey(
        KYCWorkflow,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    is_staff = models.BooleanField(
        default=False,
        help_text="True if sent by an officer, False if sent by the customer.",
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Msg #{self.pk} on {self.workflow_id} by {self.sender_id}"
