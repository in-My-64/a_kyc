from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OCRResultViewSet

router = DefaultRouter()
router.register(r'ocr-results', OCRResultViewSet, basename='ocrresult')

urlpatterns = [path('', include(router.urls))]
