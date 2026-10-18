"""
Ingest every image in a folder as a test document, run the full KYC
pipeline on each, then print a summary.

Usage:
    python manage.py test_ids_from_folder
    python manage.py test_ids_from_folder --folder media/ids_to_test_with
    python manage.py test_ids_from_folder --reset

Creates one test customer per image. Idempotent by file hash: re-running
with the same folder reuses existing Documents and just re-runs the
pipeline.
"""
from __future__ import annotations

import hashlib
import time
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from backend.core.models import KYCWorkflow
from backend.documents.models import Document
from backend.risk.models import EvidenceScore, RiskClassification
from backend.screening.models import ScreeningResult
from backend.verification.models import ParsedDocument

User = get_user_model()

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic", ".pdf"}
POLL_INTERVAL_S = 1.5
POLL_TIMEOUT_S = 300


class Command(BaseCommand):
    help = "Ingest images from a folder, run the KYC pipeline on each, print a summary."

    def add_arguments(self, parser):
        parser.add_argument(
            "--folder",
            default="media/ids_to_test_with",
            help="Folder containing the images (relative to project root).",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing test users for the folder before running.",
        )
        parser.add_argument(
            "--no-wait",
            action="store_true",
            help="Dispatch only; don't poll for completion.",
        )

    def handle(self, *args, **opts):
        from backend.core.views import StartKYCView

        folder = Path(opts["folder"]).resolve()
        if not folder.is_dir():
            self.stdout.write(self.style.ERROR(f"Folder not found: {folder}"))
            return

        images = sorted(
            p for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS
        )
        if not images:
            self.stdout.write(self.style.ERROR(f"No images found in {folder}"))
            return

        self.stdout.write(f"Found {len(images)} images in {folder}")
        self.stdout.write("")

        # ---- Phase 1: ingest each image as a Document --------------------
        ingested: list[tuple[str, Document]] = []

        for img in images:
            # Username derived from the filename, stable across runs.
            stem = slugify(img.stem)[:40] or "test"
            username = f"folder_{stem}"[:80]

            if opts["reset"]:
                User.objects.filter(username=username).delete()

            user, u_created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@test.kyc",
                    "nationality": "ZW",
                },
            )
            if u_created:
                user.set_password("Test-Pass-1234!")
                user.save()

            raw = img.read_bytes()
            file_hash = hashlib.sha256(raw).hexdigest()

            doc = Document.objects.filter(
                customer=user, file_hash=file_hash,
            ).first()

            if doc is None:
                doc = Document(
                    customer=user,
                    doc_type="national_id",
                    file_hash=file_hash,
                )
                doc.file.save(img.name, ContentFile(raw), save=True)

            ingested.append((user.username, doc))
            self.stdout.write(
                f"  ingested  {username:40s}  doc #{doc.pk}  {img.name}"
            )

        # ---- Phase 2: run the pipeline ------------------------------------
        self.stdout.write("")
        self.stdout.write("Dispatching pipeline runs…")
        self.stdout.write("")

        dispatched: list[tuple[str, Document, str]] = []

        for username, doc in ingested:
            KYCWorkflow.objects.filter(
                customer=doc.customer, document=doc,
                status__in=["PENDING", "IN_PROGRESS"],
            ).update(
                status="FAILED", current_step="cancelled",
                last_error="Cancelled by test_ids_from_folder",
            )

            try:
                wf = StartKYCView._create_workflow_or_conflict(doc.customer, doc)
            except Exception as exc:
                self.stdout.write(
                    self.style.WARNING(
                        f"  {username:40s}  could not create workflow: {exc}"
                    )
                )
                continue

            tid = str(wf.tracking_id)
            wf.status = "IN_PROGRESS"
            wf.current_step = "preprocess_document"
            wf.save(update_fields=["status", "current_step", "updated_at"])

            try:
                StartKYCView._dispatch_chain(doc.id, tid)
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(
                        f"  {username:40s}  dispatch failed: {exc}"
                    )
                )
                continue

            self.stdout.write(f"  {username:40s}  doc #{doc.id:<4d}  → {tid}")
            dispatched.append((username, doc, tid))

        if opts["no_wait"] or not dispatched:
            self.stdout.write(self.style.SUCCESS("Dispatched."))
            return

        # ---- Phase 3: wait ------------------------------------------------
        self.stdout.write("")
        self.stdout.write("Waiting for workflows to finish…")

        started = time.time()
        pending = {tid for _, _, tid in dispatched}

        while pending and (time.time() - started) < POLL_TIMEOUT_S:
            terminal = set(
                str(t)
                for t in KYCWorkflow.objects
                .filter(tracking_id__in=pending)
                .exclude(status__in=["PENDING", "IN_PROGRESS"])
                .values_list("tracking_id", flat=True)
            )
            pending -= terminal
            if pending:
                time.sleep(POLL_INTERVAL_S)

        # ---- Phase 4: summary --------------------------------------------
        self.stdout.write("")
        self.stdout.write("=" * 120)
        self.stdout.write(
            f"{'CUSTOMER':<42} {'WINNER':<10} {'ID':<22} "
            f"{'SCREEN':<8} {'ASSESS':<7} {'RISK':<7} {'SCORE'}"
        )
        self.stdout.write("=" * 120)

        for username, doc, tid in dispatched:
            wf = KYCWorkflow.objects.filter(tracking_id=tid).first()
            parsed = (
                ParsedDocument.objects
                .filter(ocr_result__document_id=doc.id)
                .order_by("-created_at")
                .first()
            )
            corrections = (parsed.corrections or {}) if parsed else {}
            winner = corrections.get("winner") or "—"
            scores = corrections.get("engine_scores") or {}
            score_str = " ".join(
                f"{k}={v.get('score', 0):.0f}"
                for k, v in scores.items()
                if isinstance(v, dict)
            ) or "—"

            risk = (
                RiskClassification.objects
                .filter(parsed_document=parsed)
                .first() if parsed else None
            )
            evidence = (
                EvidenceScore.objects
                .filter(parsed_document=parsed)
                .first() if parsed else None
            )
            screening = (
                ScreeningResult.objects
                .filter(parsed_document=parsed)
                .first() if parsed else None
            )
            fbc = (
                FBCScreeningReport.objects
                .filter(tracking_id=tid)
                .order_by("-created_at")
                .first()
            )

            id_num = (parsed.id_number if parsed else None) or "—"
            screen = screening.status if screening else "—"
            fbc_s = fbc.overall_status if fbc else "—"
            tier = risk.tier if risk else "—"
            sc = str(evidence.score) if evidence else "—"

            line = (
                f"{username:<42} {winner:<10} {id_num:<22} "
                f"{screen:<8} {fbc_s:<7} {tier:<7} {sc}"
            )
            self.stdout.write(line)
            self.stdout.write(f"{'':<42} engines: {score_str}")

            if wf and wf.status == "FAILED":
                self.stdout.write(
                    self.style.WARNING(
                        f"{'':<42} ⚠ {wf.last_error[:90]}"
                    )
                )

        self.stdout.write("=" * 120)
        self.stdout.write("")

        completed = KYCWorkflow.objects.filter(
            tracking_id__in=[t for _, _, t in dispatched], status="COMPLETED",
        ).count()
        failed = KYCWorkflow.objects.filter(
            tracking_id__in=[t for _, _, t in dispatched], status="FAILED",
        ).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"{completed} completed · {failed} failed · "
                f"{len(dispatched) - completed - failed} still running"
            )
        )