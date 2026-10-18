from django.contrib import admin

from .models import EvidenceScore, RiskClassification


@admin.register(EvidenceScore)
class EvidenceScoreAdmin(admin.ModelAdmin):
    list_display = ("id", "parsed_document", "score", "created_at", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("parsed_document__id_number",)
    raw_id_fields = ("parsed_document",)
    # `parsed_document` is a forward FK — without select_related, every
    # row on this page issues a separate query to render the column.
    list_select_related = ("parsed_document",)
    readonly_fields = (
        "parsed_document", "score", "breakdown",
        "created_at", "updated_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(RiskClassification)
class RiskClassificationAdmin(admin.ModelAdmin):
    list_display = ("id", "parsed_document", "tier", "created_at", "updated_at")
    list_filter = ("tier", "created_at")
    search_fields = ("parsed_document__id_number", "parsed_document__name")
    raw_id_fields = ("parsed_document",)
    list_select_related = ("parsed_document",)
    readonly_fields = (
        "parsed_document", "tier", "reason",
        "created_at", "updated_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False