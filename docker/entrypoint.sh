#!/usr/bin/env bash
set -euo pipefail

# Wait for Postgres if configured
if [[ "${DATABASE_URL:-}" == postgres* ]]; then
  echo "Waiting for Postgres..."
  until python -c "
import os, sys, psycopg
url = os.environ['DATABASE_URL'].replace('postgres://', 'postgresql://')
try:
    psycopg.connect(url, connect_timeout=2).close()
except Exception as e:
    sys.exit(1)
" 2>/dev/null; do
    sleep 2
  done
  echo "Postgres is up."
fi

# Wait for Redis if configured
if [[ "${CELERY_BROKER_URL:-}" == redis* ]]; then
  echo "Waiting for Redis..."
  until python -c "
import os, sys, redis
url = os.environ['CELERY_BROKER_URL'].replace('redis://', 'redis://')
try:
    redis.from_url(url, socket_connect_timeout=2).ping()
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    sleep 2
  done
  echo "Redis is up."
fi

# Run migrations unless explicitly disabled
if [[ "${SKIP_MIGRATIONS:-0}" != "1" ]]; then
  echo "Running migrations..."
  python manage.py migrate --noinput
fi

# Collect static (safe to run on every start)
echo "Collecting static files..."
python manage.py collectstatic --noinput || true

exec "$@"
