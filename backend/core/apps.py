from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.core"
    # No `ready()` — signals are owned by the app that defines the models.
    # Audit signals are registered in backend.audit.apps.AuditConfig.ready().