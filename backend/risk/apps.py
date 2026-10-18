from django.apps import AppConfig


class RiskConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.risk"
    # No ready() — audit signals are registered by the audit app itself.