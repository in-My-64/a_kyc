from rest_framework import permissions, viewsets
from rest_framework.filters import OrderingFilter

from .models import OCRResult
from .serializers import OCRResultSerializer


class OCRResultViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/ocr-results/         list
    GET /api/ocr-results/<id>/    detail

    Scoped to the requesting user via document.customer; staff see all.

    Query params: ?ordering=created_at|confidence|id
    """

    # Overridden by get_queryset; kept only so the viewset declares the
    # same shape as every other read-only viewset in the project.
    queryset = OCRResult.objects.none()
    serializer_class = OCRResultSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ["created_at", "confidence", "id"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = OCRResult.objects.all()
        if not user.is_staff:
            qs = qs.filter(document__customer=user)
        return qs.select_related("document")