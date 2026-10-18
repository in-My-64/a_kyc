from django.apps import AppConfig


class CustomersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.customers"
    # No signals — audit logging for Customer is registered by the
    # audit app (see backend/audit/apps.py).