from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ParsedDocumentViewSet

router = DefaultRouter()
router.register(
    r"parsed-documents",
    ParsedDocumentViewSet,
    basename="parsed-document",
)

urlpatterns = [path("", include(router.urls))]