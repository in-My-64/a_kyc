# backend/kyc_system/settings/base.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

# --- Security -------------------------------------------------------------
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

# Split on comma, strip whitespace, drop empties. If the result is empty,
# fall back to localhost — never to [""] which would break every request.
_hosts_raw = os.environ.get("DJANGO_ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in _hosts_raw.split(",") if h.strip()] or [
    "localhost", "127.0.0.1",
]

# Django 4.0+ CSRF — required when the frontend is on a different origin.
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if o.strip()
]

# --- Apps -----------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "django_filters",
    "backend.customers",
    "backend.documents",
    "backend.ocr_engine",
    "backend.verification",
    "backend.screening",
    "backend.risk",
    "backend.audit",
    "backend.core",
]

# --- Middleware -----------------------------------------------------------
# JSONErrorMiddleware sits at position 1 (inside SecurityMiddleware so it
# inherits security headers; outside everything else so it catches their
# error responses too). See backend/core/middleware.py for the rationale.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "backend.core.middleware.JSONErrorMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "backend.audit.middleware.AuditMiddleware",
]

ROOT_URLCONF = "backend.kyc_system.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.kyc_system.wsgi.application"

# --- Database -------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# --- Auth -----------------------------------------------------------------
AUTH_USER_MODEL = "customers.Customer"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- i18n / TZ ------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static & media -------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# DRF's DefaultRouter generates URLs with trailing slashes; our Next proxy
# always sends them. Turning APPEND_SLASH off means Django won't try to
# redirect a missing-slash URL (which it can't do for POSTs anyway).
APPEND_SLASH = False

# --- Django REST Framework ------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Custom pagination that honours ?page_size=N up to max_page_size.
    "DEFAULT_PAGINATION_CLASS": "backend.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/min",
        "user": "300/min",
        "register": "10/hour",
        "login": "20/min",
    },
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_VERSIONING_CLASS":
        "rest_framework.versioning.QueryParameterVersioning",
    "DEFAULT_VERSION": "1.0",
    "VERSION_PARAM": "version",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # Global JSON error envelope — every exception becomes
    # {"error", "message", "detail"}.
    "EXCEPTION_HANDLER": "backend.core.exceptions.api_exception_handler",
}

# --- Celery ---------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_TASK_ALWAYS_EAGER = os.environ.get("CELERY_TASK_ALWAYS_EAGER", "0") == "1"
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True

# Time limits must sit ABOVE the VLM client's read timeout.
#
# The Ollama VLM backend uses requests timeout=(10, 300): up to 10s to
# connect, up to 300s to read. On a cold start the model loads into VRAM
# for 30-60s before the first token streams back — that window is inside
# the 300s read budget, not the soft/hard limits. If Celery killed the
# task first, the VLM would be blamed for what's actually a timeout
# configuration problem. 320/360 leaves 20s of slack above the client.
CELERY_TASK_TIME_LIMIT = 360
CELERY_TASK_SOFT_TIME_LIMIT = 320

# Retry the initial broker connection at worker startup instead of dying.
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Long-running OCR tasks: don't prefetch, and only ack after completion.
# This is what makes `autoretry_for` on a killed worker actually re-deliver
# the task to another worker instead of losing it.
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# --- Screening providers --------------------------------------------------
#
# Both providers run in the aggregate screening step. Either can be
# disabled by leaving its API key unset — the aggregator skips it and
# the other still runs. If NEITHER is configured, the workflow still
# completes but the AML section reports "Not performed" so the officer
# sees the gap rather than a false CLEAR.
#
# Providers are queried in parallel (sequential HTTP calls, but both
# fire in the aggregate task). Merge precedence:
#
#     MATCH > FLAGGED > CLEAR
#
# i.e. if any provider says MATCH, the aggregate is MATCH.

# --- OpenSanctions --------------------------------------------------------
#
# Screening provider for watchlist / PEP / sanctions matching. Client:
# backend/screening/opensanctions_client.py.
#
# LICENSING: OpenSanctions data is licensed under CC-BY-NC 4.0 for
# non-commercial use. This project's intended deployment is commercial
# (a bank's KYC pipeline) — commercial use requires a paid data license
# from OpenSanctions before deployment. The free-tier API quota
# (25,000 req/month) is a development allowance, not a production
# entitlement.
OPENSANCTIONS_API_KEY = os.environ.get("OPENSANCTIONS_API_KEY", "")
OPENSANCTIONS_BASE_URL = os.environ.get(
    "OPENSANCTIONS_BASE_URL", "https://api.opensanctions.org"
)
OPENSANCTIONS_DATASET = os.environ.get("OPENSANCTIONS_DATASET", "default")
# OpenSanctions' default is 0.7. For KYC screening, raise it — 0.7 is
# calibrated for broad recall, which floods a compliance queue with
# common-name false positives. 0.85 is a reasonable starting point;
# tune against real data.
OPENSANCTIONS_THRESHOLD = float(
    os.environ.get("OPENSANCTIONS_THRESHOLD", "0.85")
)

# --- Dilisense ------------------------------------------------------------
#
# Screening provider covering sanctions, PEPs, and adverse media.
# Client: backend/screening/dilisense_client.py.
#
# Endpoint: GET /v1/checkIndividual
# Auth:     x-api-key header
# Envelope: {"timestamp", "total_hits", "found_records": [...]}
#
# Threshold is the candidate floor passed to the provider; anything at
# or above comes back in found_records and counts as a hit for FLAGGED.
# The MATCH band (>= 0.95) is applied on top by the client so both
# providers share the same CLEAR/FLAGGED/MATCH semantics.
DILISENSE_API_KEY = os.environ.get("DILISENSE_API_KEY", "")
DILISENSE_BASE_URL = os.environ.get(
    "DILISENSE_BASE_URL", "https://api.dilisense.com"
)
DILISENSE_THRESHOLD = float(
    os.environ.get("DILISENSE_THRESHOLD", "0.80")
)

# --- File uploads ---------------------------------------------------------
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_BYTES + (1024 * 1024)
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_BYTES

# HEIC/HEIF accepted because iPhone uploads are the common case, and
# pillow-heif is registered at startup (see documents/apps.py). The
# validators module checks magic bytes, not this set — this is the
# declared-MIME allowlist, used only as a first-pass filter when the
# client sends a Content-Type header.
ALLOWED_UPLOAD_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
    "image/heic",
    "image/heif",
    "application/pdf",
}

# --- Health ---------------------------------------------------------------
HEALTH_CHECK_BROKER = (
    os.environ.get("HEALTH_CHECK_BROKER", "false").lower() == "true"
)

# --- Logging --------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {
            "handlers": ["console"], "level": "INFO", "propagate": False,
        },
        "celery": {
            "handlers": ["console"], "level": "INFO", "propagate": False,
        },
        "backend.screening": {
            "handlers": ["console"], "level": "INFO", "propagate": False,
        },
    },
}
# --- Biometric face match ------------------------------------------------
FACE_MATCH_MODEL = "buffalo_l"            # 99.83% LFW, 97.25% IJB-C
FACE_MATCH_CTX_ID = -1                    # -1 = CPU, 0 = GPU
FACE_MATCH_THRESHOLD = 0.45               # strict KYC default; tune on your data
FACE_MATCH_REVIEW_RATIO = 0.75            # review band starts at threshold * 0.75
FACE_MATCH_FMR_TARGET = "1e-4"            # documentation only — not enforced
