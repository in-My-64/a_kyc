"""
Global API exception handler.

Every error — DRF's, Django's, or a raw Python exception — becomes a
structured JSON response with a stable shape:

    {
      "error": "snake_case_code",
      "message": "human-readable summary",
      "detail": { … optional field errors … }
    }

Runs inside DRF's request/response cycle. Errors that happen before DRF
gets control (URL resolution, middleware) are handled by
backend.core.middleware.JSONErrorMiddleware.
"""

from __future__ import annotations

import logging

from django.core.exceptions import (
    ObjectDoesNotExist,
    PermissionDenied,
    RequestDataTooBig,
    SuspiciousOperation,
    ValidationError as DjangoValidationError,
)
from django.db import DatabaseError, IntegrityError, OperationalError
from django.http import Http404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Status → code mapping
# ---------------------------------------------------------------------------

_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    410: "gone",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "unprocessable_entity",
    429: "rate_limited",
    500: "server_error",
    502: "bad_gateway",
    503: "service_unavailable",
    504: "gateway_timeout",
}

_DEFAULT_MESSAGES = {
    "bad_request": "The request was invalid.",
    "unauthorized": "You need to sign in to continue.",
    "forbidden": "You don't have permission to do that.",
    "not_found": "The requested resource was not found.",
    "method_not_allowed": "That request method isn't supported here.",
    "conflict": "This conflicts with existing data.",
    "gone": "This resource is no longer available.",
    "payload_too_large": "The file or request was too large.",
    "unsupported_media_type": "That file type isn't supported.",
    "unprocessable_entity": "The request was understood but couldn't be processed.",
    "rate_limited": "Too many requests. Please wait and try again.",
    "server_error": "Something went wrong on our end. Try again shortly.",
    "bad_gateway": "An upstream service is unavailable. Try again shortly.",
    "service_unavailable": "The service is temporarily unavailable.",
    "gateway_timeout": "The request timed out.",
}


def _code_for(status_code: int) -> str:
    return _STATUS_CODES.get(status_code, "request_failed")


def _message_for(code: str) -> str:
    return _DEFAULT_MESSAGES.get(code, "Request failed.")


# ---------------------------------------------------------------------------
# Normalize DRF's response into our envelope
# ---------------------------------------------------------------------------

def _normalise_drf_response(response) -> Response:
    data = response.data
    code = _code_for(response.status_code)

    # Already in our shape.
    if isinstance(data, dict) and "error" in data and "message" in data:
        return response

    # `{"detail": "string"}` — DRF ValidationError, NotAuthenticated, Throttled.
    if isinstance(data, dict) and isinstance(data.get("detail"), str):
        return Response(
            {"error": code, "message": data["detail"]},
            status=response.status_code,
            headers=response.headers,
        )

    # Field-level validation errors — `{"field": ["msg"]}`.
    if isinstance(data, dict):
        return Response(
            {
                "error": "validation_error",
                "message": "Please check the highlighted fields.",
                "detail": data,
            },
            status=response.status_code,
            headers=response.headers,
        )

    # DRF sometimes serialises non-field errors as a list.
    if isinstance(data, list):
        return Response(
            {
                "error": "validation_error",
                "message": "Please check the highlighted fields.",
                "detail": {"non_field_errors": data},
            },
            status=response.status_code,
            headers=response.headers,
        )

    # Anything else — wrap it.
    return Response(
        {"error": code, "message": _message_for(code), "detail": data},
        status=response.status_code,
        headers=response.headers,
    )


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

def api_exception_handler(exc, context):
    # 1. Let DRF handle its own first.
    response = drf_default_handler(exc, context)
    if response is not None:
        return _normalise_drf_response(response)

    # 2. Django-side exceptions DRF doesn't recognise.

    if isinstance(exc, RequestDataTooBig):
        limit_mb = None
        try:
            from django.conf import settings as dj_settings
            limit_mb = round(
                dj_settings.DATA_UPLOAD_MAX_MEMORY_SIZE / (1024 * 1024), 1
            )
        except Exception:
            pass
        message = "The request body is too large."
        if limit_mb:
            message = f"The request body exceeds the {limit_mb} MB limit."
        return Response(
            {"error": "payload_too_large", "message": message},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    if isinstance(exc, DjangoValidationError):
        message_dict = getattr(exc, "message_dict", None) or {
            "non_field_errors": list(exc.messages)
        }
        return Response(
            {
                "error": "validation_error",
                "message": "Please check the highlighted fields.",
                "detail": message_dict,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Database unique constraints → 409. Detected before the generic
    # IntegrityError branch.
    if isinstance(exc, IntegrityError):
        logger.warning("IntegrityError: %s", exc)
        return Response(
            {
                "error": "conflict",
                "message": "This record conflicts with existing data.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    # Database unavailable → 503.
    if isinstance(exc, OperationalError):
        logger.exception("Database operational error: %s", exc)
        return Response(
            {
                "error": "service_unavailable",
                "message": "The service is temporarily unavailable.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # Generic DB error.
    if isinstance(exc, DatabaseError):
        logger.exception("Database error: %s", exc)
        return Response(
            {"error": "server_error", "message": _message_for("server_error")},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, Http404):
        return Response(
            {"error": "not_found", "message": _message_for("not_found")},
            status=status.HTTP_404_NOT_FOUND,
        )

    if isinstance(exc, (PermissionDenied, SuspiciousOperation)):
        return Response(
            {"error": "forbidden", "message": _message_for("forbidden")},
            status=status.HTTP_403_FORBIDDEN,
        )

    if isinstance(exc, ObjectDoesNotExist):
        return Response(
            {"error": "not_found", "message": _message_for("not_found")},
            status=status.HTTP_404_NOT_FOUND,
        )

    # 3. Unhandled — log the full trace, return a safe message.
    logger.exception(
        "Unhandled API exception: %s",
        exc,
        extra={
            "path": getattr(context.get("request"), "path", None),
        },
    )
    return Response(
        {"error": "server_error", "message": _message_for("server_error")},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )