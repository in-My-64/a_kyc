import logging
from functools import wraps

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import ForeignKey
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AuditLogEntry
from .redaction import redact

logger = logging.getLogger(__name__)
User = get_user_model()


def _safe_create(**kwargs):
    """Never let an audit failure break the write that triggered it."""
    try:
        AuditLogEntry.objects.create(**kwargs)
    except Exception:
        logger.exception("Audit signal failed: %s", kwargs.get("action"))


def _already_logged(action: str, key: str, value) -> bool:
    """
    Return True if an entry with this action and this instance id exists.

    Uses JSONField `__contains` when the DB supports it (Postgres), falls
    back to a Python-side scan otherwise (SQLite). Without this the
    signal fires on every save and either duplicates `*_completed`
    events (Postgres) or crashes the task (SQLite, no `@>` operator).

    Best-effort only: this is check-then-insert, not a uniqueness
    guarantee. Two concurrent saves of the same row can both miss the
    SELECT and both INSERT a `*_completed` row. Duplicates are
    acceptable on an append-only audit log; missing entries are not, so
    the dedup deliberately errs toward over-logging.

    On Postgres, `details__contains` on jsonb is a sequential scan
    unless a GIN index exists on `details`. On an unbounded audit table
    that scan grows without limit — add `GinIndex(fields=["details"])`
    (or drop this dedup and accept duplicates) before the table gets
    large.
    """
    qs = AuditLogEntry.objects.filter(action=action)

    if connection.features.supports_json_field_contains:
        return qs.filter(details__contains={key: value}).exists()

    # SQLite has no JSON containment operator. Scan the (small) set of
    # rows with this action in Python instead.
    for details in qs.values_list("details", flat=True):
        if isinstance(details, dict) and details.get(key) == value:
            return True
    return False


def _guard(handler):
    """
    Decorator: never let a signal handler's own failure roll back the
    save that triggered it. `_safe_create` covers the writes, but the
    `_already_logged` lookups can also throw (schema drift, backend
    limitations), and those must not propagate either.
    """

    @wraps(handler)
    def wrapper(*args, **kwargs):
        try:
            return handler(*args, **kwargs)
        except Exception:
            logger.exception(
                "Audit signal %s failed", handler.__name__,
            )

    return wrapper


def _owner(instance):
    """
    Walk forward FKs to find the Customer that owns `instance`.
    Never follows reverse accessors (which would cycle).
    """
    if isinstance(instance, User):
        return instance

    customer = getattr(instance, "customer", None)
    if customer is not None:
        return customer

    for attr in ("parsed_document", "ocr_result", "document"):
        try:
            field = instance._meta.get_field(attr)
        except Exception:
            continue
        if not isinstance(field, ForeignKey):
            continue
        rel = getattr(instance, attr, None)
        if rel is not None:
            return _owner(rel)

    return None


def _details(*pairs):
    return {k: v for k, v in pairs if v is not None}


# --- Customer -------------------------------------------------------------

@receiver(post_save, sender=User)
@_guard
def on_customer_saved(sender, instance, created, **kwargs):
    if not created:
        return
    _safe_create(
        action="customer_created",
        user=instance,
        details=redact(_details(
            ("username", instance.username),
            ("email", instance.email),
            ("date_of_birth", instance.date_of_birth),
            ("nationality", instance.nationality),
        )),
        success=True,
    )


# --- Document -------------------------------------------------------------

@receiver(post_save, sender="documents.Document")
@_guard
def on_document_saved(sender, instance, created, **kwargs):
    if not created:
        return
    _safe_create(
        action="document_uploaded",
        user=_owner(instance),
        details=redact(_details(
            ("document_id", instance.pk),
            ("file", instance.file.name if instance.file else None),
            ("processed_file",
             instance.processed_file.name if instance.processed_file else None),
        )),
        success=True,
    )


# --- OCRResult ------------------------------------------------------------

@receiver(post_save, sender="ocr_engine.OCRResult")
@_guard
def on_ocr_saved(sender, instance, created, **kwargs):
    if created:
        _safe_create(
            action="ocr_started",
            user=_owner(instance),
            details={"ocr_result_id": instance.pk},
            success=True,
        )
        return

    # `ocr_completed` is logged on the first post-create save. The row
    # is created by preprocess_document (no OCR yet) with confidence at
    # its default; run_ocr_task updates it once with the final text and
    # confidence. There is no intermediate update path, so the first
    # non-created save is the completion signal.
    #
    # An earlier version gated on `confidence is None`, written when
    # confidence was a nullable FloatField. It is now a DecimalField
    # (null=False, default=0), so that guard was unreachable dead code
    # and has been removed. 0.0 is a valid confidence ("no words found"
    # or every per-word confidence was negative), so we deliberately do
    # not filter on truthiness either.
    if _already_logged("ocr_completed", "ocr_result_id", instance.pk):
        return

    _safe_create(
        action="ocr_completed",
        user=_owner(instance),
        details=redact(_details(
            ("ocr_result_id", instance.pk),
            ("confidence", float(instance.confidence)),
            ("extracted_text", instance.extracted_text),
        )),
        success=True,
    )


# --- ParsedDocument -------------------------------------------------------

@receiver(post_save, sender="verification.ParsedDocument")
@_guard
def on_parsed_saved(sender, instance, created, **kwargs):
    if not created:
        return
    _safe_create(
        action="document_parsed",
        user=_owner(instance),
        details=redact(_details(
            ("parsed_id", instance.pk),
            ("doc_type", instance.doc_type),
            ("id_number", instance.id_number),
            ("name", instance.name),
        )),
        success=True,
    )


# --- ScreeningResult ------------------------------------------------------

@receiver(post_save, sender="screening.ScreeningResult")
@_guard
def on_screening_saved(sender, instance, created, **kwargs):
    # On create, log unconditionally. On updates, dedup against the
    # create-time entry. If the create-time `_safe_create` failed (it
    # swallows exceptions), the next save sees no existing entry and
    # retries — which is what we want on an append-only log.
    if not created and _already_logged(
        "screening_completed", "screening_id", instance.pk,
    ):
        return
    _safe_create(
        action="screening_completed",
        user=_owner(instance),
        details=redact(_details(
            ("screening_id", instance.pk),
            ("status", instance.status),
        )),
        success=True,
    )


# --- EvidenceScore --------------------------------------------------------

@receiver(post_save, sender="risk.EvidenceScore")
@_guard
def on_evidence_saved(sender, instance, created, **kwargs):
    if not created and _already_logged(
        "evidence_scored", "evidence_id", instance.pk,
    ):
        return
    _safe_create(
        action="evidence_scored",
        user=_owner(instance),
        details=redact(_details(
            ("evidence_id", instance.pk),
            ("score", float(instance.score)),
        )),
        success=True,
    )


# --- RiskClassification ---------------------------------------------------

@receiver(post_save, sender="risk.RiskClassification")
@_guard
def on_risk_saved(sender, instance, created, **kwargs):
    if not created and _already_logged(
        "risk_assigned", "classification_id", instance.pk,
    ):
        return
    _safe_create(
        action="risk_assigned",
        user=_owner(instance),
        details=redact(_details(
            ("classification_id", instance.pk),
            ("tier", instance.tier),
            ("reason", list(instance.reason or [])),
        )),
        success=True,
    )