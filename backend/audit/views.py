import logging

from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter

from .models import AuditLogEntry
from .serializers import AuditLogSerializer

logger = logging.getLogger(__name__)

try:
    from django_filters.rest_framework import DjangoFilterBackend
    _HAS_FILTER = True
except ImportError:
    DjangoFilterBackend = None
    _HAS_FILTER = False
    logger.warning(
        "django-filter is not installed — ?action=, ?success=, and "
        "?user= on AuditLogViewSet will be silently ignored.",
    )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/audit/         list (staff only)
    GET /api/audit/<id>/    detail (staff only)

    Query parameters:
      ?search=<text>       — action substring
      ?action=<code>       — exact action (requires django-filter)
      ?success=true|false  — exact (requires django-filter)
      ?user=<id>           — exact (requires django-filter)
      ?ordering=<field>    — timestamp, id; prefix '-' for desc
      ?page=<int>
      ?page_size=<int>
    """

    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAdminUser]

    filter_backends = [SearchFilter, OrderingFilter]
    if _HAS_FILTER:
        filter_backends = [DjangoFilterBackend] + filter_backends
        filterset_fields = ["action", "success", "user"]

    search_fields = ["action"]
    ordering_fields = ["timestamp", "id"]
    ordering = ["-timestamp"]

    def get_queryset(self):
        return AuditLogEntry.objects.all()