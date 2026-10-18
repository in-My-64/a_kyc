"""Test settings: fast hashers, in-memory DB, eager Celery."""

from .dev import *  # noqa: F401,F403


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Fast password hashing; tests don't need PBKDF2's 100k iterations.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Keep uploaded files out of the working tree.
MEDIA_ROOT = "/tmp/kyc_test_media"

# Silence the audit middleware's request-body parse during tests.
LOGGING["root"]["level"] = "WARNING"  # noqa: F405
