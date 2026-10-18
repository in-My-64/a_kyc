import logging

from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter

from .models import EvidenceScore, RiskClassification
from .serializers import EvidenceScoreSerializer, RiskClassificationSerializer

logger = logging.getLogger(__name__)

try:
    from django_filters.rest_framework import DjangoFilterBackend
    _HAS_FILTER = True
except ImportError:
    DjangoFilterBackend = None
    _HAS_FILTER = False
    logger.warning(
        "django-filter is not installed — ?tier= on "
        "RiskClassificationViewSet will be silently ignored.",
    )


class EvidenceScoreViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/evidence/         list
    GET /api/evidence/<id>/    detail

    Scoped to the requesting user via the FK chain
    (parsed_document → ocr_result → document → customer); staff see all.

    Query params: ?ordering=score|created_at|id
    """

    queryset = EvidenceScore.objects.none()
    serializer_class = EvidenceScoreSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ["score", "created_at", "id"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = EvidenceScore.objects.all()
        if not user.is_staff:
            qs = qs.filter(
                parsed_document__ocr_result__document__customer=user,
            )
        return qs


class RiskClassificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/risk/         list
    GET /api/risk/<id>/    detail

    Scoped to the requesting user; staff see all.

    Query params:
      ?tier=LOW|MEDIUM|HIGH  — exact (requires django-filter)
      ?ordering=tier|created_at|id
      ?page=<int>
      ?page_size=<int>

    Note: `reason` is a JSONField holding a list of strings. Free-text
    search against it is intentionally NOT exposed — a `__icontains`
    lookup on a Postgres jsonb column raises UnsupportedLookup. Add a
    dedicated ?reason_contains= filter if you need it later.
    """

    queryset = RiskClassification.objects.none()
    serializer_class = RiskClassificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [OrderingFilter]
    if _HAS_FILTER:
        filter_backends = [DjangoFilterBackend] + filter_backends
        filterset_fields = ["tier"]

    ordering_fields = ["tier", "created_at", "id"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = RiskClassification.objects.all()
        if not user.is_staff:
            qs = qs.filter(
                parsed_document__ocr_result__document__customer=user,
            )
        return qs