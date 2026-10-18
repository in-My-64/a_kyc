#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys

# Load .env BEFORE Django reads settings, so any DJANGO_* / DATABASE_URL
# / CELERY_* vars in it take effect for management commands too.
#
# Without this call, `manage.py migrate`, `shell`, `runserver`, and
# `test` all resolve settings from the shell environment only — the
# .env file is invisible to them, even though wsgi.py and celery.py
# load it. That produces the confusing situation where the dev server
# picks up .env when serving requests but not while booting.
try:
    from backend.kyc_system.env import load_env
    load_env()
except ImportError:
    # Running before the venv is set up; nothing to load.
    pass


def main():
    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE", "backend.kyc_system.settings.dev",
    )
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()