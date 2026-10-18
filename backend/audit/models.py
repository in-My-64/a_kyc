from django.conf import settings
from django.db import models


class AuditLogEntry(models.Model):
    """
    Immutable record of a significant action. Rows are created by
    middleware and signals; they are never updated or deleted through
    the API. The admin panel is read-only.
    """

    action = models.CharField(max_length=50, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_entries",
        db_index=True,
    )
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    details = models.JSONField(default=dict)
    success = models.BooleanField(default=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["action", "timestamp"]),
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["success", "timestamp"]),
        ]

    def __str__(self):
        return f"AuditLogEntry({self.action}, user={self.user_id})"