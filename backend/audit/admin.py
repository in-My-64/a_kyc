from django.contrib import admin

from .models import AuditLogEntry


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    """
    Read-only view of audit entries. No add, no change, no delete —
    audit rows are append-only by policy.
    """

    list_display = ("id", "action", "user", "success", "timestamp")
    list_filter = ("action", "success", "timestamp")
    search_fields = ("action",)
    raw_id_fields = ("user",)
    readonly_fields = ("action", "user", "timestamp", "details", "success")
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False