from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.audit"

    def ready(self):
        # Importing signals registers all @receiver decorators.
        from . import signals  # noqa: F401