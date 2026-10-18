"""
Rewrite Django's default HTML error responses to JSON when the request
is an API call.

Django's own 404/500 handlers run OUTSIDE DRF, so DRF's exception handler
can't touch them. This middleware intercepts the response Django produces
and converts HTML → JSON when the request path starts with /api/.

Placement: it sits IMMEDIATELY INSIDE SecurityMiddleware (position 1 in
MIDDLEWARE). That gives us both properties we want:

  * It wraps SessionMiddleware, CommonMiddleware, CsrfViewMiddleware,
    AuthenticationMiddleware, AuditMiddleware and the view — so an
    error raised by any of those is converted too.
  * SecurityMiddleware wraps *it*, so SecurityMiddleware still attaches
    its security headers (HSTS, X-Content-Type-Options, Referrer-Policy,
    …) to the JSON response we return.
"""

import logging

from django.http import JsonResponse

logger = logging.getLogger(__name__)


_STATUS_TO_CODE = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    500: "server_error",
    502: "bad_gateway",
    503: "service_unavailable",
    504: "gateway_timeout",
}

_CODE_TO_MESSAGE = {
    "bad_request": "The request was invalid.",
    "unauthorized": "You need to sign in.",
    "forbidden": "You don't have permission.",
    "not_found": "Not found.",
    "method_not_allowed": "That method isn't supported.",
    "server_error": "Something went wrong on our end.",
    "bad_gateway": "An upstream service is unavailable.",
    "service_unavailable": "The service is temporarily unavailable.",
    "gateway_timeout": "The request timed out.",
}

# Headers we want to keep from Django's original error response.
_PRESERVE_HEADERS = ("Vary", "Retry-After", "Allow", "WWW-Authenticate")


class JSONErrorMiddleware:
    """
    Convert non-JSON error responses under /api/ to JSON.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if not request.path.startswith("/api/"):
            return response
        if response.status_code < 400:
            return response
        if "application/json" in response.get("Content-Type", ""):
            return response

        code = _STATUS_TO_CODE.get(response.status_code, "request_failed")
        message = _CODE_TO_MESSAGE.get(code, "Request failed.")

        new_response = JsonResponse(
            {"error": code, "message": message},
            status=response.status_code,
        )

        # Preserve semantically important headers from Django's response.
        for header in _PRESERVE_HEADERS:
            value = response.get(header)
            if value:
                new_response[header] = value

        return new_response