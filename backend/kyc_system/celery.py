# backend/kyc_system/celery.py
import os

from celery import Celery

# Load .env BEFORE Django reads settings so any CELERY_* vars in it
# take effect.
from backend.kyc_system.env import load_env
load_env()

os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "backend.kyc_system.settings.dev",
)

app = Celery("kyc_system")
app.config_from_object("django.conf:settings", namespace="CELERY")

# Explicit list of app packages Celery should scan for tasks.py.
#
# autodiscover_tasks() with no arguments walks INSTALLED_APPS and
# imports <app>.tasks for each. That misses two of our modules:
#
#   · superocr is a subpackage of ocr_engine, not an installed app.
#     Its tasks.py would not be imported, and classify_document_v2
#     would be invisible to the worker.
#   · verification.tasks defines create_parsed_document, which the
#     workflow chain calls between run_ocr_task and
#     run_vlm_extraction. Without it in this list, the task is
#     dispatched but the worker has no implementation to run.
#
# Keep this list in sync with any task module that lives outside the
# standard INSTALLED_APPS/<app>/tasks.py layout.
# Standard discovery: walks INSTALLED_APPS and imports <app>.tasks
# for every app that has one. Covers:
#   backend.documents.tasks       -> preprocess_document
#   backend.ocr_engine.tasks      -> run_ocr_task
#   backend.verification.tasks    -> create_parsed_document, classify_document
#   backend.risk.tasks            -> compute_evidence_score, classify_risk
#   backend.screening.tasks       -> screen_document (legacy)
app.autodiscover_tasks()

# Modules that do NOT follow the <app>.tasks convention. These must be
# imported explicitly or the worker will reject them as unregistered.
app.conf.imports = (
    "backend.verification.tasks_compare",   # compare_extractions
    "backend.ocr_engine.vlm.tasks",         # run_vlm_extraction
    "backend.core.audit_tasks",             # log_audit_summary
    "backend.core.assessment_tasks",        # run_sanctions_screening
    "backend.risk.face_match",              # run_face_match
)