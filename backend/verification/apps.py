from django.apps import AppConfig


class VerificationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.verification"
    # No ready() — audit signals are registered by the audit app itself.