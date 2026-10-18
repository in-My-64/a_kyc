# backend/screening/models.py
from django.db import models


class ScreeningResult(models.Model):
    """
    Result of screening one ParsedDocument against OpenSanctions.

    One row per parsed document. `details.matches` embeds the full
    match payload (entity id, caption, score, topics, datasets,
    explanations) so the row is self-contained: reading it later does
    not require the OpenSanctions API to be reachable, and does not
    require any local watchlist table.

    Historical note: this model used to pair with a `WatchlistEntry`
    table used for local fuzzy matching. That table has been removed;
    OpenSanctions is now the single screening source. Rows created
    before that change remain valid — their `details.matches` shape
    differs slightly (each entry has `entry` and `reason` keys rather
    than `entity_id` and `caption`), but the surrounding structure is
    compatible.
    """

    STATUS_CHOICES = [
        ("MATCH", "Match"),
        ("FLAGGED", "Flagged"),
        ("CLEAR", "Clear"),
    ]

    parsed_document = models.OneToOneField(
        "verification.ParsedDocument",
        on_delete=models.CASCADE,
        related_name="screening_result",
    )
    status = models.CharField(max_length=8, choices=STATUS_CHOICES)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    # `auto_now` only fires when the field is included in update_fields
    # or defaults — screen_document passes it via update_or_create
    # defaults for that reason.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            # ScreeningResultAdmin.list_filter and any ?status= query
            # would otherwise full-scan the table.
            models.Index(fields=["status"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"ScreeningResult({self.parsed_document_id}: {self.status})"