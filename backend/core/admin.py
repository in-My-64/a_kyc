from django.contrib import admin

from .models import KYCWorkflow


# ---------------------------------------------------------------------------
# KYC workflow
# ---------------------------------------------------------------------------

@admin.register(KYCWorkflow)
class KYCWorkflowAdmin(admin.ModelAdmin):
    list_display = (
        "tracking_id",
        "customer",
        "status",
        "current_step",
        "created_at",
    )
    list_filter = ("status", "current_step", "created_at")
    search_fields = (
        "tracking_id",
        "customer__username",
        "customer__email",
    )
    raw_id_fields = ("customer", "document")
    readonly_fields = (
        "tracking_id",
        "status",
        "current_step",
        "last_error",
        "preprocess_task_id",
        "ocr_task_id",
        "classification_task_id",
        "screening_task_id",
        "evidence_score_task_id",
        "risk_classification_task_id",
        "created_at",
        "updated_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        # Workflows are created by the API, never by hand.
        return False
