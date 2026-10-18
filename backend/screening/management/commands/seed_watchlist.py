"""
Seed the watchlist with a curated set of sample entries.

Idempotent: re-running won't duplicate entries. Matching is on the
`entry.id` JSON field when present, otherwise on the `entry.name` value.

Usage:
    python manage.py seed_watchlist              # seed if empty
    python manage.py seed_watchlist --reset      # delete existing + seed
    python manage.py seed_watchlist --count 20   # seed 20 entries
    python manage.py seed_watchlist --dry-run    # show plan, don't write
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from backend.screening.models import WatchlistEntry


# ---------------------------------------------------------------------------
# Curated sample entries
# ---------------------------------------------------------------------------
#
# Deliberately covers the full screening outcome matrix:
#   - exact ID match        → MATCH
#   - name near-duplicate   → MATCH (≥90)
#   - name with typo        → FLAGGED (75–89)
#   - unrelated name        → CLEAR (<75)
#
# Names are uppercase and single-spaced to match what ParsedDocument
# stores after OCR + .upper() normalisation.

SAMPLE_ENTRIES = [
    # --- National IDs (ZW format: NN-NNNNNN[A-Z]NN) -----------------------
    {"id": "63-1234567A78", "name": "JOHN DOE"},
    {"id": "63-9876543B21", "name": "JANE SMITH"},
    {"id": "63-4567890C45", "name": "MICHAEL JOHNSON"},
    {"id": "63-2345678D91", "name": "SARAH WILLIAMS"},
    {"id": "63-8765432E34", "name": "DAVID BROWN"},
    {"id": "63-3456789F67", "name": "EMMA DAVIS"},

    # --- Passports (format: AANNNNNN) -----------------------------------
    {"id": "AB123456", "name": "ROBERT MILLER"},
    {"id": "CD789012", "name": "LISA ANDERSON"},
    {"id": "EF345678", "name": "THOMAS TAYLOR"},
    {"id": "GH901234", "name": "PATRICIA MOORE"},

    # --- Common-name / high-collision entries ---------------------------
    # Useful for testing the FLAGGED band against legitimate documents.
    {"id": "ID1000001", "name": "JOHN SMITH"},
    {"id": "ID1000002", "name": "MARY JONES"},
    {"id": "ID1000003", "name": "JAMES WILSON"},
    {"id": "ID1000004", "name": "LINDA MARTINEZ"},

    # --- Name-only entries (no ID) — exercises fuzzy matching only ------
    {"name": "ALEXANDER HAMILTON"},
    {"name": "CATHERINE WALKER"},
    {"name": "BENJAMIN HARRIS"},
    {"name": "REBECCA THOMPSON"},
    {"name": "CHRISTOPHER LEWIS"},
    {"name": "VICTORIA ROBINSON"},

    # --- Entries designed to test boundary scores ----------------------
    # "JONH DOE" is one transposition from "JOHN DOE" — ~87.5 → FLAGGED.
    {"id": "ID2000001", "name": "JONH DOE"},
    # "JANE SMYTH" is one character off "JANE SMITH" — ~90-92 → MATCH.
    {"id": "ID2000002", "name": "JANE SMYTH"},
]


class Command(BaseCommand):
    help = "Seed the watchlist with sample entries."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete all existing watchlist entries before seeding.",
        )
        parser.add_argument(
            "--count",
            type=int,
            default=None,
            help="Limit seed to N entries (default: all).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without writing.",
        )

    def handle(self, *args, **options):
        reset = options["reset"]
        limit = options["count"]
        dry_run = options["dry_run"]

        entries = SAMPLE_ENTRIES[:limit] if limit else SAMPLE_ENTRIES

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no writes"))
            self.stdout.write(f"Would seed {len(entries)} entries:")
            for e in entries:
                self.stdout.write(f"  {e}")
            return

        with transaction.atomic():
            if reset:
                deleted, _ = WatchlistEntry.objects.all().delete()
                self.stdout.write(
                    self.style.WARNING(f"Deleted {deleted} existing entries.")
                )

            created = 0
            skipped = 0

            for entry_data in entries:
                if self._exists(entry_data):
                    skipped += 1
                    continue
                WatchlistEntry.objects.create(entry=entry_data)
                created += 1

        total = WatchlistEntry.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created} new entries "
                f"({skipped} already present). "
                f"Total: {total}."
            )
        )

    @staticmethod
    def _exists(entry_data: dict) -> bool:
        """
        Idempotency: an entry exists if a row has the same `id` (when
        present) or the same uppercase `name`.
        """
        eid = str(entry_data.get("id") or "").strip()
        name = str(entry_data.get("name") or "").strip().upper()

        qs = WatchlistEntry.objects.all()
        if eid:
            return qs.filter(entry__id=eid).exists()
        return qs.filter(entry__name=name).exists()
