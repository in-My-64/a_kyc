from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EvidenceScoreViewSet, RiskClassificationViewSet

router = DefaultRouter()
router.register(r"risk", RiskClassificationViewSet, basename="risk")
router.register(r"evidence", EvidenceScoreViewSet, basename="evidence")

urlpatterns = [path("", include(router.urls))]