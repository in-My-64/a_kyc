from rest_framework import serializers

from .models import OCRResult


class OCRResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = OCRResult
        fields = [
            "id",
            "document",
            "ocr_image_path",
            "extracted_text",
            "confidence",
            "details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields