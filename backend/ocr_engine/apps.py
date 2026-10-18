from django.apps import AppConfig


class OcrEngineConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.ocr_engine"
    # No ready() — audit signals are registered by the audit app itself.