import os

from django.core.wsgi import get_wsgi_application

# Load .env BEFORE Django reads settings.
from backend.kyc_system.env import load_env
load_env()

os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "backend.kyc_system.settings.dev",
)

application = get_wsgi_application()