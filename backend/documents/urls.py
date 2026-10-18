from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DocumentViewSet, SelfieViewSet

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'selfies', SelfieViewSet, basename='selfie')

urlpatterns = [path('', include(router.urls))]
