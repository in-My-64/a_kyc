from rest_framework import serializers

from .models import EvidenceScore, RiskClassification


class EvidenceScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceScore
        fields = [
            "id",
            "parsed_document",
            "score",
            "breakdown",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class RiskClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiskClassification
        fields = [
            "id",
            "parsed_document",
            "tier",
            "reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields