# backend/screening/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ScreeningResultViewSet

router = DefaultRouter()
router.register(r"screenings", ScreeningResultViewSet)

urlpatterns = [path("", include(router.urls))]