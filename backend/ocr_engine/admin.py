from django.contrib import admin

from .models import OCRResult


@admin.register(OCRResult)
class OCRResultAdmin(admin.ModelAdmin):
    """
    Read-only: OCRResult rows are created by documents.preprocess_document
    and populated by ocr_engine.run_ocr_task. Never edited by hand.
    """

    list_display = ("id", "document", "confidence", "created_at", "updated_at")
    list_filter = ("created_at",)
    search_fields = ("document__customer__username", "document__customer__email")
    raw_id_fields = ("document",)
    # Avoids one query per row when rendering the FK column.
    list_select_related = ("document",)
    readonly_fields = (
        "document",
        "ocr_image_path",
        "extracted_text",
        "confidence",
        "details",
        "created_at",
        "updated_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False