# backend/core/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .health import HealthView
from .views import KYCWorkflowViewSet, StartKYCView, WorkflowDecisionView, WorkflowMessageView
from .views_status import WorkflowStatusView

router = DefaultRouter()
router.register(r"workflows", KYCWorkflowViewSet, basename="workflow")

urlpatterns = [
    path("start-kyc/", StartKYCView.as_view(), name="start-kyc"),
    path(
        "status/<uuid:tracking_id>/",
        WorkflowStatusView.as_view(),
        name="workflow-status",
    ),
    path(
        "workflows/<uuid:tracking_id>/decision/",
        WorkflowDecisionView.as_view(),
        name="workflow-decision",
    ),
    path("healthz/", HealthView.as_view(), name="healthz"),
    # Simulation modules — removed.
    path("", include(router.urls)),
]