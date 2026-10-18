import json
import logging

from .redaction import redact

logger = logging.getLogger(__name__)

# DELETE is included deliberately: a deletion is exactly the kind of
# event an audit trail exists to record, and it carries no body worth
# the multipart/JSON guards below. Remove it here if you have a policy
# reason to exclude it — nothing else in this module depends on the set.
LOG_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
LOG_PREFIX = "/api/"
SKIP_PREFIXES = ("/api/audit/", "/api/schema/", "/api/docs/")
MAX_BODY_BYTES = 4096
MAX_EXCEPTION_CHARS = 500


def _body_preview(request):
    """
    Return a redacted preview of the request body, or None.

    - multipart/form-data: NEVER read the body. Reading request.POST or
      request.FILES triggers Django's multipart parser, which buffers the
      entire file into memory and defeats the DATA_UPLOAD_MAX_MEMORY_SIZE
      guard. We return a static marker and let the view parse the stream.
    - JSON: parsed and redacted, up to MAX_BODY_BYTES.
    - everything else: content type only.
    """
    ctype = (request.content_type or "").lower()

    if ctype.startswith("multipart/form-data"):
        return {
            "_multipart": True,
            "_note": "body not read; see the target view for field names",
        }

    if ctype.startswith("application/json"):
        try:
            content_length = int(request.META.get("CONTENT_LENGTH") or 0)
        except (TypeError, ValueError):
            content_length = 0

        if content_length > MAX_BODY_BYTES:
            return {"_skipped": "body-too-large", "bytes": content_length}

        # No usable Content-Length: we cannot bound the read. Calling
        # request.body would materialize an arbitrarily large payload
        # into middleware memory just to redact a preview, which is a
        # worse failure mode than losing the preview. Real JSON clients
        # (DRF, requests, axios, fetch) send Content-Length; the ones
        # that don't are either chunked transfers or a misconfigured
        # proxy, and both are cases where skipping is the right call.
        if content_length == 0:
            return {"_skipped": "content-length-missing"}

        # We are here only because Content-Length said the body is small.
        # Parse the WHOLE body — slicing to MAX_BODY_BYTES would cut a
        # multi-byte JSON document mid-token and report "_unparsed" for
        # payload we could have redacted and stored. The Content-Length
        # check above is the size guard; this is the parse.
        try:
            raw = request.body
        except Exception:
            return {"_unreadable": True, "content_type": ctype}

        try:
            data = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            return {"_unparsed": True, "bytes": len(raw)}
        return redact(data)

    return {"_content_type": ctype}


def _is_skipped(path: str) -> bool:
    """
    Prefix check with boundary: /api/audit matches /api/audit/...
    but not /api/auditanything.
    """
    for prefix in SKIP_PREFIXES:
        p = prefix.rstrip("/")
        if path == p or path.startswith(p + "/"):
            return True
    return False


class AuditMiddleware:
    """
    Log every POST/PUT/PATCH/DELETE under /api/ (except audit's own
    endpoints) to AuditLogEntry.

    Two failure modes, both handled as side effects:

      * If the view raises, we still write an audit row (status=500,
        success=False) before re-raising. Without this, a request that
        produced a 500 would leave no trace — precisely the case an
        audit trail exists to catch.

      * If the audit write itself fails, we log and swallow — a broken
        audit subsystem must never break the request that triggered it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not self._should_log(request):
            return self.get_response(request)

        body = _body_preview(request)
        try:
            response = self.get_response(request)
        except Exception as exc:
            # The exception is about to propagate to JSONErrorMiddleware
            # (which converts it to a 500 envelope). Record it here,
            # before we re-raise, so the audit trail reflects it.
            self._write(
                request, body,
                status=500,
                success=False,
                extra={
                    "exception": (
                        f"{type(exc).__name__}: {exc}"
                    )[:MAX_EXCEPTION_CHARS],
                },
            )
            raise

        self._write(
            request, body,
            status=response.status_code,
            success=response.status_code < 400,
        )
        return response

    @staticmethod
    def _should_log(request) -> bool:
        return (
            request.path.startswith(LOG_PREFIX)
            and not _is_skipped(request.path)
            and request.method in LOG_METHODS
        )

    @staticmethod
    def _write(request, body, *, status, success, extra=None):
        from .models import AuditLogEntry

        user = getattr(request, "user", None)
        if user is not None and not user.is_authenticated:
            user = None

        details = {
            "path": request.path,
            "method": request.method,
            "status": status,
            "body": body,
        }
        if extra:
            details.update(extra)

        try:
            AuditLogEntry.objects.create(
                action=f"http_{request.method.lower()}",
                user=user,
                details=redact(details),
                success=success,
            )
        except Exception:
            logger.exception(
                "Audit middleware failed for %s %s",
                request.method, request.path,
            )