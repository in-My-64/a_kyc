# backend/screening/views.py
from rest_framework import permissions, viewsets

from .models import ScreeningResult
from .serializers import ScreeningResultSerializer


class ScreeningResultViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/screenings/         list
    GET /api/screenings/<id>/    detail

    Scoped to the requesting user via
    parsed_document → ocr_result → document → customer; staff see all.

    Screening is performed by the `screen_document` Celery task against
    OpenSanctions; there is no write API. Rows are read-only here.
    """

    queryset = ScreeningResult.objects.none()  # replaced by get_queryset
    serializer_class = ScreeningResultSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ScreeningResult.objects.all()
        if not user.is_staff:
            qs = qs.filter(
                parsed_document__ocr_result__document__customer=user,
            )
        return (
            qs
            .select_related("parsed_document")
            .order_by("-id")
        )