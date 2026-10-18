from django.contrib.auth import get_user_model
from django.db.models import Exists, OuterRef, Subquery
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from backend.core.models import KYCWorkflow
from backend.documents.models import Document
from backend.screening.models import ScreeningResult

from .serializers import (
    CustomerReadSerializer,
    CustomerSerializer,
    PasswordChangeSerializer,
)
from .throttles import RegisterThrottle

User = get_user_model()


class CustomerViewSet(viewsets.ModelViewSet):
    """
    POST   /api/customers/                     register (AllowAny, throttled)
    GET    /api/customers/                     staff only
    GET    /api/customers/<pk>/                self or staff
    PATCH  /api/customers/<pk>/                self only
    DELETE /api/customers/<pk>/                staff only
    GET    /api/customers/me/                  current user
    POST   /api/customers/set-password/        change own password
    GET    /api/customers/cleared/             staff only — latest screening CLEAR
    GET    /api/customers/flagged/             staff only — ever MATCH or FLAGGED
    GET    /api/customers/<pk>/overview/       staff only — full aggregate

    "self or staff" / "self only" scoping is enforced by get_queryset(),
    not by permission classes — a non-staff user asking for someone
    else's pk simply gets a 404.
    """

    serializer_class = CustomerSerializer
    queryset = User.objects.all()

    def get_permissions(self):
        if self.action == "create":
            return [permissions.AllowAny()]
        if self.action in {
            "me",
            "set_password",
            "retrieve",
            "update",
            "partial_update",
        }:
            return [permissions.IsAuthenticated()]
        # list, destroy, cleared, flagged, overview
        return [permissions.IsAdminUser()]

    def get_throttles(self):
        if self.action == "create":
            return [RegisterThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action in ("list", "retrieve", "me", "cleared", "flagged"):
            return CustomerReadSerializer
        if self.action == "set_password":
            return PasswordChangeSerializer
        return CustomerSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return User.objects.none()
        if user.is_staff:
            return User.objects.all()
        return User.objects.filter(pk=user.pk)

    @action(detail=False, methods=["get"])
    def me(self, request):
        return Response(CustomerReadSerializer(request.user).data)

    @action(
        detail=False,
        methods=["post"],
        url_path="set-password",
        permission_classes=[permissions.IsAuthenticated],
    )
    def set_password(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"ok": True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="cleared")
    def cleared(self, request):
        """Customers whose most recent screening is CLEAR."""
        return self._screened_response(request, statuses=["CLEAR"])

    @action(detail=False, methods=["get"], url_path="flagged")
    def flagged(self, request):
        """
        Customers with a watchlist hit in their history.

        Inclusion is *ever*, not *latest*: a customer who matched in
        March, re-verified clean in April, and uploaded again in June
        still appears — the compliance officer needs to know they were
        flagged at some point.
        """
        return self._screened_response(request, statuses=["MATCH", "FLAGGED"])

    def _screened_response(self, request, statuses):
        """
        Two subqueries, two jobs:

          * `has_match` (Exists) — INCLUSION. Did this customer ever
            have a ScreeningResult with a status in `statuses`?

          * `latest` (Subquery) — DISPLAY. Their current status, rendered
            as the badge on each row.
        """
        has_match = ScreeningResult.objects.filter(
            parsed_document__ocr_result__document__customer=OuterRef("pk"),
            status__in=statuses,
        )
        latest = (
            ScreeningResult.objects
            .filter(
                parsed_document__ocr_result__document__customer=OuterRef("pk"),
            )
            .order_by("-id")
            .values("status")[:1]
        )

        qs = (
            User.objects
            .annotate(
                latest_screening_status=Subquery(latest),
                has_matching_screening=Exists(has_match),
            )
            .filter(has_matching_screening=True)
            .order_by("-date_joined")
        )

        page = self.paginate_queryset(qs)
        serializer = CustomerReadSerializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[permissions.IsAdminUser],
    )
    def overview(self, request, pk=None):
        """
        GET /api/customers/<pk>/overview/
        """
        customer = self.get_object()

        documents = Document.objects.filter(customer=customer)
        workflows = (
            KYCWorkflow.objects
            .filter(customer=customer)
            .order_by("-created_at")[:20]
        )
        screenings = (
            ScreeningResult.objects
            .filter(parsed_document__ocr_result__document__customer=customer)
            .select_related("parsed_document")
            .order_by("-created_at")[:10]
        )

        return Response({
            "customer": CustomerReadSerializer(customer).data,
            "counts": {
                "documents": documents.count(),
                "workflows": KYCWorkflow.objects.filter(customer=customer).count(),
                "screenings": ScreeningResult.objects.filter(
                    parsed_document__ocr_result__document__customer=customer,
                ).count(),
            },
            "workflows": [
                {
                    "id": w.pk,
                    "tracking_id": str(w.tracking_id),
                    "reference": w.reference,
                    "document_id": w.document_id,
                    "status": w.status,
                    "current_step": w.current_step,
                    "last_error": w.last_error,
                    "created_at": w.created_at,
                    "updated_at": w.updated_at,
                }
                for w in workflows
            ],
            "screenings": [
                {
                    "id": s.pk,
                    "status": s.status,
                    "provider": (s.details or {}).get("provider", "—"),
                    "match_count": (s.details or {}).get("match_count", 0),
                    "created_at": s.created_at,
                }
                for s in screenings
            ],
        })
