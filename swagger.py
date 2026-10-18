"""
OpenAPI schema view.

Currently NOT wired into urls.py or added to INSTALLED_APPS — this module
is a stub. Either register the URL and add `drf_yasg` to INSTALLED_APPS,
or delete this file. An unreferenced module is worse than no module: it
implies the schema endpoint exists when it doesn't.

When you do wire it in, keep `public=False` in production (see below) so
the schema isn't served to anonymous clients.
"""

from django.conf import settings

from drf_yasg import openapi
from drf_yasg.views import get_schema_view

# Matches REST_FRAMEWORK["DEFAULT_VERSION"] in settings/base.py. Two
# different labels for the same API (e.g. "v1" here vs "1.0" there)
# confuse clients that read both the schema and the query parameter.
_API_VERSION = "1.0"

schema_view = get_schema_view(
    openapi.Info(
        title="KYC API",
        default_version=_API_VERSION,
        description="Customer onboarding, document verification, "
                    "screening, and risk classification.",
    ),
    # public=True exposes the schema to anonymous callers. Fine in dev;
    # gate it behind authentication in prod.
    public=settings.DEBUG,
)