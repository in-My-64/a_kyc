# backend/verification/views.py
import logging

from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter, SearchFilter

from .models import ParsedDocument
from .serializers import ParsedDocumentSerializer

logger = logging.getLogger(__name__)

try:
    from django_filters.rest_framework import DjangoFilterBackend
    _HAS_FILTER = True
except ImportError:
    DjangoFilterBackend = None
    _HAS_FILTER = False
    logger.warning(
        "django-filter is not installed — ?doc_type= on "
        "ParsedDocumentViewSet will be silently ignored.",
    )


class ParsedDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/parsed-documents/         list
    GET /api/parsed-documents/<id>/    detail

    Scoped to the requesting user via
    parsed_document → ocr_result → document → customer; staff see all.

    Query parameters:
      ?search=<text>          — name / id_number / nationality substring
      ?doc_type=<choice>      — exact match (requires django-filter)
      ?ordering=<field>       — created_at, id
    """

    serializer_class = ParsedDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [SearchFilter, OrderingFilter]
    if _HAS_FILTER:
        filter_backends = [DjangoFilterBackend] + filter_backends
        filterset_fields = ["doc_type"]

    search_fields = ["name", "id_number", "nationality"]
    ordering_fields = ["created_at", "id"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = ParsedDocument.objects.all()
        if not user.is_staff:
            qs = qs.filter(ocr_result__document__customer=user)
        return qs