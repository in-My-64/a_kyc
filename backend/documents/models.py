from django.conf import settings
from django.db import models


DOC_TYPE_CHOICES = [
    ("national_id", "National ID"),
    ("passport", "Passport"),
    ("licence", "Driver's Licence"),
    ("unknown", "Unknown"),
]


class Document(models.Model):
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    doc_type = models.CharField(
        max_length=20,
        choices=DOC_TYPE_CHOICES,
        default="unknown",
        help_text="Customer's claim; the classifier may override this.",
        db_index=True,
    )
    file = models.FileField(upload_to="uploads/", max_length=255)
    # SHA-256 of the raw uploaded bytes. Used to reject re-uploads of the
    # exact same file. Not a substitute for semantic dedup (same physical
    # ID photographed twice), which would need the extracted ID number
    # after OCR.
    file_hash = models.CharField(
        max_length=64, blank=True, default="", db_index=True,
    )
    processed_file = models.FileField(
        upload_to="processed/",
        max_length=255,
        blank=True,
        null=True,
    )
    preprocessing_meta = models.JSONField(default=dict, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "-uploaded_at"]),
            models.Index(fields=["customer", "doc_type"]),
            models.Index(fields=["customer", "file_hash"]),
        ]

    def __str__(self):
        name = self.file.name.rsplit("/", 1)[-1] if self.file else "(no file)"
        return f"Document#{self.pk} – {self.customer_id} – {name}"

class Selfie(models.Model):
    """
    A selfie uploaded by a customer for biometric verification.
    Reuses the Document file validation pipeline (size, sniff, decode).
    """
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="selfies",
    )
    file = models.FileField(upload_to="selfies/", max_length=255)
    file_hash = models.CharField(
        max_length=64, blank=True, default="", db_index=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "-uploaded_at"]),
        ]

    def __str__(self):
        return f"Selfie#{self.pk} – {self.customer_id}"
