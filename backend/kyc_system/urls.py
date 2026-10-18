from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.static import serve as static_serve


@xframe_options_exempt
def _serve_media(request, path, **kwargs):
    """
    Serve MEDIA_ROOT files without X-Frame-Options.

    Django's XFrameOptionsMiddleware sets `X-Frame-Options: DENY` on
    every response, which blocks Firefox/Chrome from embedding the
    response in an <iframe>. The document preview panel needs to embed
    PDFs, and the backend is on a different origin (:8001) from the
    frontend (:3000), so we exempt this route in dev.

    In production, /media/ is served by nginx or a CDN, which is where
    the equivalent configuration lives.
    """
    return static_serve(request, path, document_root=settings.MEDIA_ROOT)


urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/", include("backend.customers.urls")),
    path("api/", include("backend.customers.auth_urls")),
    path("api/", include("backend.documents.urls")),
    path("api/", include("backend.ocr_engine.urls")),
    path("api/", include("backend.verification.urls")),
    path("api/", include("backend.screening.urls")),
    path("api/", include("backend.risk.urls")),
    path("api/", include("backend.audit.urls")),
    path("api/", include("backend.core.urls")),
]

# Serve uploaded files in dev, without X-Frame-Options so the frontend
# can embed PDFs. In production nginx or a CDN handles /media/ — the
# Django server never touches it.
if settings.DEBUG:
    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", _serve_media),
    ]