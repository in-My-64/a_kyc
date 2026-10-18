from django.contrib import admin
from django.utils.html import format_html

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "customer",
        "doc_type",
        "filename",
        "has_processed",
        "uploaded_at",
    )
    list_filter = ("doc_type", "uploaded_at")
    search_fields = (
        "customer__username",
        "customer__email",
        "file",
    )
    raw_id_fields = ("customer",)
    readonly_fields = (
        "uploaded_at",
        "processed_file",
        "preprocessing_meta",
    )
    date_hierarchy = "uploaded_at"
    ordering = ("-uploaded_at",)

    @admin.display(description="File")
    def filename(self, obj):
        if not obj.file:
            return "—"
        name = obj.file.name.rsplit("/", 1)[-1]
        return format_html('<span title="{}">{}</span>', obj.file.name, name)

    @admin.display(boolean=True, description="Processed")
    def has_processed(self, obj):
        return bool(obj.processed_file)