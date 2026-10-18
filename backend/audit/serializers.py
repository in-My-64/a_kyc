from rest_framework import serializers

from .models import AuditLogEntry


class AuditLogSerializer(serializers.ModelSerializer):
    """
    Read-only projection of an audit entry. Every field is immutable
    through the API.
    """

    class Meta:
        model = AuditLogEntry
        fields = ["id", "action", "user", "timestamp", "details", "success"]
        read_only_fields = fields