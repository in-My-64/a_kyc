from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Keep the base.py SQLite default explicit so nothing drifts.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}

# Mail goes to the console in dev — no SMTP server required.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Celery eager execution is env-driven (CELERY_TASK_ALWAYS_EAGER). In dev
# we want eager so a separate worker process isn't required — but we do
# NOT want task exceptions to propagate back into the calling view.
#
# With EAGER_PROPAGATES=True (base.py default), a task that raises inside
# the chain bubbles all the way up to StartKYCView.post, where it looks
# exactly like a dispatch failure even though the chain actually ran and
# the workflow was correctly marked FAILED by on_failure. That produces
# a 500 on a request the client should just poll on.
#
# Setting this to False makes eager mode behave like a real broker: the
# chain runs inline, the exception goes to the log, and /api/start-kyc/
# returns 202 with the tracking_id. Clients then see the failure via
# /api/status/<tid>/. Tests that want to assert on the raised exception
# can flip this back with @override_settings(CELERY_TASK_EAGER_PROPAGATES=True).
CELERY_TASK_EAGER_PROPAGATES = False