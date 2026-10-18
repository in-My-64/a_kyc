"""
Unauthenticated health probe for load balancers and Docker healthchecks.

Returns 200 when DB and (optionally) the Celery broker are reachable.
Set `HEALTH_CHECK_BROKER=false` to skip the broker ping in environments
where the broker is intentionally absent.
"""

import logging

from django.conf import settings
from django.db import connection
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


def _check_db():
    try:
        with connection.cursor() as c:
            c.execute("SELECT 1")
            c.fetchone()
        return True, ""
    except Exception as exc:
        logger.warning("health: db check failed: %s", exc)
        return False, str(exc)


def _check_broker():
    """Best-effort Celery broker ping. Returns (ok, message)."""
    try:
        # Import the canonical app configured in kyc_system/celery.py
        # instead of `celery.current_app`, which resolves off the
        # "current app" stack and can differ under management commands
        # or ASGI startup that never imported wsgi.py.
        from backend.kyc_system.celery import app as celery_app
        conn = celery_app.connection()
        conn.ensure_connection(max_retries=1, timeout=1)
        conn.release()
        return True, ""
    except Exception as exc:
        logger.warning("health: broker check failed: %s", exc)
        return False, str(exc)


class HealthView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        db_ok, db_msg = _check_db()

        # base.py defines HEALTH_CHECK_BROKER explicitly (env-driven,
        # defaulting to false). No getattr default needed — passing one
        # that disagreed with base.py was misleading.
        check_broker = getattr(settings, "HEALTH_CHECK_BROKER", False)
        if check_broker:
            br_ok, br_msg = _check_broker()
        else:
            br_ok, br_msg = True, "skipped"

        body = {
            "status": "ok" if db_ok and br_ok else "degraded",
            "db": {"ok": db_ok, "message": db_msg},
            "broker": {"ok": br_ok, "message": br_msg},
        }
        http_status = 200 if db_ok and br_ok else 503
        return Response(body, status=http_status)