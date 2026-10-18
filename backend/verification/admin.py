from django.contrib import admin

from .models import ParsedDocument


@admin.register(ParsedDocument)
class ParsedDocumentAdmin(admin.ModelAdmin):
    """
    Fully read-only view: ParsedDocument rows are created and updated by
    the classify_document Celery task, never by hand.

    Because has_add/change/delete_permission are all False, no edit form
    is ever rendered — the `readonly_fields` tuple below exists purely
    as documentation of which fields the pipeline owns.
    """

    list_display = (
        "id",
        "doc_type",
        "id_number",
        "name",
        "nationality",
        "has_issues",
        "created_at",
    )
    list_filter = ("doc_type", "created_at")
    search_fields = ("id_number", "name", "nationality")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    # Not strictly required (the admin never shows an edit form), but
    # documenting the pipeline-owned fields prevents the next reader
    # from adding an editable fieldset that silently no-ops.
    readonly_fields = (
        "ocr_result",
        "doc_type",
        "id_number",
        "name",
        "dob",
        "expiry",
        "nationality",
        "corrections",
        "mrz_data",
        "verification_issues",
        "created_at",
        "updated_at",
    )

    @admin.display(boolean=True, description="Issues")
    def has_issues(self, obj):
        return bool(obj.verification_issues)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False