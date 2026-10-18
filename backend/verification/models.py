from django.db import models

from .constants import DOC_TYPES


class ParsedDocument(models.Model):
    """
    Field-extraction output for one OCR result.

    `corrections` records OCR confusion fixes applied during extraction.
    `verification_issues` collects consistency and sanity failures (MRZ
    checksum mismatch, DOB/expiry mismatch, implausible dates, etc.) —
    non-empty means the pipeline should treat the document as suspect.
    `mrz_data` stores the parsed MRZ block when one was found.
    """

    ocr_result = models.OneToOneField(
        "ocr_engine.OCRResult",
        on_delete=models.CASCADE,
        related_name="parsed_document",
    )
    doc_type = models.CharField(
        max_length=20,
        choices=DOC_TYPES,
        default="unknown",
        db_index=True,
    )
    # Index lives in Meta.indexes — db_index=True here would be the
    # same B-tree created twice.
    id_number = models.CharField(max_length=32, null=True, blank=True)
    name = models.CharField(max_length=100, null=True, blank=True)
    dob = models.DateField(null=True, blank=True)
    expiry = models.DateField(null=True, blank=True)
    nationality = models.CharField(max_length=30, null=True, blank=True)

    corrections = models.JSONField(default=dict, blank=True)
    mrz_data = models.JSONField(default=dict, blank=True)
    verification_issues = models.JSONField(default=list, blank=True)

    # `db_index=True` here covers standalone ORDER BY -created_at; the
    # composite (doc_type, -created_at) index below covers per-type
    # listings. They serve different query shapes — don't merge them.
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["doc_type", "-created_at"]),
            models.Index(fields=["id_number"]),
        ]

    def __str__(self):
        return f"ParsedDocument({self.pk}, type={self.doc_type})"