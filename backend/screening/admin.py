# backend/screening/admin.py
from django.contrib import admin

from .models import ScreeningResult


@admin.register(ScreeningResult)
class ScreeningResultAdmin(admin.ModelAdmin):
    list_display = ("id", "parsed_document", "status", "created_at", "updated_at")
    list_filter = ("status", "created_at")
    raw_id_fields = ("parsed_document",)
    # Without this, list_display's `parsed_document` column issues one
    # query per row (100 extra queries per page).
    list_select_related = ("parsed_document",)
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        # ScreeningResult rows are created by the Celery task, never by
        # hand. Same convention as KYCWorkflowAdmin.
        return False