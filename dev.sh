#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .venv/bin/activate

DJANGO_PORT="${DJANGO_PORT:-8001}"

if command -v tput >/dev/null && [ -t 1 ]; then
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2)
  DIM=$(tput dim); RESET=$(tput sgr0)
else
  BLUE=""; GREEN=""; DIM=""; RESET=""
fi

# Track child PIDs so we can kill exactly those — no "kill 0" which
# would signal the whole process group including this shell.
DJANGO_PID=""
CELERY_PID=""
SHUTTING_DOWN=0

cleanup() {
  # Guard against re-entry: a second Ctrl+C arrives before the first
  # cleanup finishes and would otherwise loop.
  [ "$SHUTTING_DOWN" = "1" ] && return
  SHUTTING_DOWN=1

  echo
  echo "${DIM}shutting down…${RESET}"

  # TERM the pipe parents (the sed pipelines). Their children —
  # python and celery — receive SIGHUP when the pipe closes.
  [ -n "$DJANGO_PID" ] && kill -TERM "$DJANGO_PID" 2>/dev/null || true
  [ -n "$CELERY_PID" ] && kill -TERM "$CELERY_PID" 2>/dev/null || true

  # Give them a moment, then force-kill anything still alive.
  sleep 0.5
  [ -n "$DJANGO_PID" ] && kill -KILL "$DJANGO_PID" 2>/dev/null || true
  [ -n "$CELERY_PID" ] && kill -KILL "$CELERY_PID" 2>/dev/null || true

  # Belt and braces: kill any orphaned runserver/celery started by
  # this script (matched by command string, not PID — safer if a
  # subprocess was re-parented).
  pkill -f "manage.py runserver ${DJANGO_PORT}" 2>/dev/null || true
  pkill -f "celery -A backend.kyc_system worker" 2>/dev/null || true
}

# Trap on EXIT as well as the signals — covers the case where the
# shell itself exits due to a `set -e` failure.
trap cleanup EXIT INT TERM

echo "${BLUE}[django]${RESET} starting on :${DJANGO_PORT}"
python manage.py runserver "${DJANGO_PORT}" 2>&1 \
  | sed -u "s/^/${BLUE}[django]${RESET} /" &
DJANGO_PID=$!

echo "${GREEN}[celery]${RESET} starting worker"
celery -A backend.kyc_system worker -l info 2>&1 \
  | sed -u "s/^/${GREEN}[celery]${RESET} /" &
CELERY_PID=$!

# Wait for either to exit. `wait -n` returns as soon as one child
# dies, which triggers the trap on the way out.
wait -n || true
