from django.db import models


class EvidenceScore(models.Model):
    """
    Weighted completeness score for a parsed document.
    One row per document; `update_or_create` on recompute.
    """

    parsed_document = models.OneToOneField(
        "verification.ParsedDocument",
        on_delete=models.CASCADE,
        related_name="evidence_score",
    )
    score = models.DecimalField(max_digits=5, decimal_places=2, db_index=True)
    breakdown = models.JSONField(default=dict)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            # List view orders by -created_at with no other filter;
            # without this index that's a full sort per page.
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"EvidenceScore({self.parsed_document_id}: {self.score})"


class RiskClassification(models.Model):
    TIER_CHOICES = [("LOW", "LOW"), ("MEDIUM", "MEDIUM"), ("HIGH", "HIGH")]

    parsed_document = models.OneToOneField(
        "verification.ParsedDocument",
        on_delete=models.CASCADE,
        related_name="risk_classification",
    )
    tier = models.CharField(max_length=6, choices=TIER_CHOICES, db_index=True)
    reason = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tier", "-created_at"]),
        ]

    def __str__(self):
        return f"RiskClassification({self.parsed_document_id}: {self.tier})"

class FaceMatchResult(models.Model):
    """
    One biometric comparison per ParsedDocument.
    Stores embeddings so re-thresholding does not require re-running inference.
    """
    parsed_document = models.OneToOneField(
        "verification.ParsedDocument",
        on_delete=models.CASCADE,
        related_name="face_match",
    )

    # --- Outcome ---
    decision = models.CharField(
        max_length=8,
        choices=[("MATCH", "Match"), ("REVIEW", "Review"), ("FAIL", "Fail")],
    )
    similarity = models.FloatField(
        help_text="Cosine similarity between the two 512-D ArcFace embeddings.",
    )
    threshold = models.FloatField(
        help_text="The operating threshold this decision was made against.",
    )
    fmr_target = models.CharField(
        max_length=16, default="1e-4",
        help_text="False Match Rate the threshold was calibrated for.",
    )

    # --- Liveness ---
    liveness_passed = models.BooleanField(null=True, blank=True)
    liveness_score = models.FloatField(null=True, blank=True)

    # --- Provenance ---
    id_crop_path = models.CharField(max_length=255, null=True, blank=True)
    selfie_crop_path = models.CharField(max_length=255, null=True, blank=True)
    model_name = models.CharField(max_length=64, default="buffalo_l")
    model_version = models.CharField(max_length=16, blank=True, default="")
    details = models.JSONField(default=dict)

    # --- Embeddings (for re-scoring) ---
    selfie_embedding = models.JSONField(
        null=True, blank=True,
        help_text="512-float ArcFace vector from the selfie.",
    )
    id_embedding = models.JSONField(
        null=True, blank=True,
        help_text="512-float ArcFace vector from the document face crop.",
    )

    # --- 1:N Deduplication ---
    duplicate_customer_id = models.IntegerField(null=True, blank=True, help_text="If this face matches an existing customer, their ID goes here.")
    duplicate_similarity = models.FloatField(null=True, blank=True)


    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"FaceMatch({self.parsed_document_id}): {self.decision} ({self.similarity:.3f})"
