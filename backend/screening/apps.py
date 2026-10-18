from django.apps import AppConfig


class ScreeningConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.screening"

    def ready(self):
        # Import for side-effects: registers the audit signal handlers.
        # Do not remove even though `signals` is unused here — flake8
        # is silenced by the noqa below.
        from backend.audit import signals  # noqa: F401