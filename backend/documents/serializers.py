import hashlib

from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.exceptions import APIException
from rest_framework import status

from .models import Document, Selfie
from .validators import (
    validate_file_content,
    validate_mime_type,
    validate_upload_size,
)


class DocumentAlreadyUploaded(APIException):
    """
    409 returned when the uploaded file is byte-identical to a document
    the requesting user already owns. The detail payload points at the
    existing document so the frontend can offer a jump link.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = "duplicate_document"

    def __init__(self, existing: Document):
        super().__init__(
            {
                "error": "duplicate_document",
                "message": (
                    "This exact file has already been uploaded to your "
                    "account."
                ),
                "detail": {
                    "existing_document_id": existing.id,
                    "existing_filename": (
                        existing.file.name.rsplit("/", 1)[-1]
                        if existing.file else ""
                    ),
                    "uploaded_at": existing.uploaded_at.isoformat(),
                },
            }
        )

    def __str__(self):
        return "This file has already been uploaded."


class DocumentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(
        validators=[
            validate_upload_size,
            validate_mime_type,
            validate_file_content,
        ],
    )
    file_hash = serializers.CharField(read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "customer",
            "file",
            "file_hash",
            "processed_file",
            "doc_type",
            "preprocessing_meta",
            "uploaded_at",
        ]
        read_only_fields = [
            "id",
            "customer",
            "file_hash",
            "processed_file",
            "preprocessing_meta",
            "uploaded_at",
        ]

    def to_internal_value(self, data):
        # The file (and everything derived from it: file_hash, processed_file,
        # the OCRResult) is write-once. Replacing it on PATCH would leave all of
        # those stale and sidestep the duplicate check. Reject loudly rather
        # than silently ignoring the field.
        if self.instance is not None and "file" in data:
            raise serializers.ValidationError(
                {"file": ["A document's file cannot be replaced. "
                          "Delete the document and upload a new one."]}
            )
        return super().to_internal_value(data)

    def validate_file(self, value):
        # Compute SHA-256 in one pass, then rewind so storage reads from
        # the start of the stream.
        digest = hashlib.sha256()
        for chunk in value.chunks():
            digest.update(chunk)
        value.seek(0)
        hexdigest = digest.hexdigest()
        self._computed_hash = hexdigest

        customer = self.context["request"].user
        existing = (
            Document.objects
            .filter(customer=customer, file_hash=hexdigest)
            .first()
        )
        if existing:
            raise DocumentAlreadyUploaded(existing)

        return value

    def create(self, validated_data):
        validated_data["file_hash"] = getattr(self, "_computed_hash", "")
        # validate_file's duplicate check is check-then-insert, so two concurrent
        # uploads of the same bytes can both pass it. The DB constraint on
        # (customer, file_hash) is the real guard; translate its failure into the
        # same 409 the pre-check produces. (The losing request's stored file is
        # orphaned by Django having saved it before the INSERT; sweep those in
        # your media cleanup job.)
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            existing = Document.objects.filter(
                customer=validated_data.get("customer"),
                file_hash=validated_data["file_hash"],
            ).first()
            if existing is None:
                raise
            raise DocumentAlreadyUploaded(existing)

class SelfieSerializer(serializers.ModelSerializer):
    file = serializers.FileField(
        validators=[
            validate_upload_size,
            validate_mime_type,
            validate_file_content,
        ],
    )
    file_hash = serializers.CharField(read_only=True)

    class Meta:
        model = Selfie
        fields = ["id", "file", "file_hash", "uploaded_at"]
        read_only_fields = ["id", "file_hash", "uploaded_at"]

    def validate_file(self, value):
        import hashlib
        digest = hashlib.sha256()
        for chunk in value.chunks():
            digest.update(chunk)
        value.seek(0)
        self._computed_hash = digest.hexdigest()
        return value

    def create(self, validated_data):
        validated_data["file_hash"] = getattr(self, "_computed_hash", "")
        validated_data["customer"] = self.context["request"].user
        return super().create(validated_data)
