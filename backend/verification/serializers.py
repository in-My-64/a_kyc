from rest_framework import serializers

from .models import ParsedDocument


class ParsedDocumentSerializer(serializers.ModelSerializer):
    """
    Read-only projection. `ocr_result` is rendered as its PK — DRF reads
    it from the parent row, so no extra query is incurred even without
    select_related on the viewset queryset.
    """

    class Meta:
        model = ParsedDocument
        fields = [
            "id",
            "ocr_result",
            "doc_type",
            "id_number",
            "name",
            "dob",
            "expiry",
            "nationality",
            "corrections",
            "mrz_data",
            "verification_issues",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields