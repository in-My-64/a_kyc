# backend/screening/serializers.py
from rest_framework import serializers

from .models import ScreeningResult


class ScreeningResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScreeningResult
        fields = "__all__"