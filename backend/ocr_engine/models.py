from django.db import models


class OCRResult(models.Model):
    """
    OCR output for one Document.

    `ocr_image_path` is the storage-relative path to the binarized
    variant produced by documents/preprocess_utils.preprocess_image().
    It is distinct from Document.processed_file (the un-binarized
    "clean" variant used for face-match) because OCR and biometric
    comparison need different preprocessing.
    """

    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.CASCADE,
        related_name="ocr_results",
    )
    ocr_image_path = models.CharField(max_length=255, blank=True, default="")
    extracted_text = models.TextField(blank=True, default="")
    confidence = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        null=False,
        blank=True,
        help_text="Average per-word confidence in [0, 100]. 0 means "
                  "either no words were found or all confidences were "
                  "negative.",
    )
    details = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["document", "-created_at"]),
            models.Index(fields=["confidence"]),
        ]
        constraints = [
            # The workflow chain creates exactly one OCRResult per
            # Document (documents/tasks.py uses get_or_create). A unique
            # constraint makes that intent real at the DB level, so a
            # race between two chains (which WorkflowAlreadyRunning
            # prevents at the API layer but not at the task layer)
            # cannot produce duplicates.
            models.UniqueConstraint(
                fields=["document"], name="ocrresult_unique_document",
            ),
        ]

    def __str__(self):
        return f"OCRResult(doc={self.document_id}, conf={self.confidence})"