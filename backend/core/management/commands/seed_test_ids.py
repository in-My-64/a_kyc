"""
Seed the seven real-world Zimbabwe National ID cards as test data.

For each ID:
  * Generates a PNG that mimics the card layout, with the extracted
    fields printed as they appear on the original.
  * Creates a Customer account (username derived from the ID number).
  * Uploads the PNG as a Document.
  * Seeds a 360° profile so the customer detail page has data
    immediately without waiting for the pipeline.

Two IDs are added to the watchlist so that running the KYC pipeline
produces MATCH / FLAGGED screening results. The others screen CLEAR.

Idempotent: re-running will not duplicate rows. Existing users and
documents are left alone.

Usage:
    python manage.py seed_test_ids
    python manage.py seed_test_ids --reset   # delete existing test IDs first
"""
from __future__ import annotations

import io
import os

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from PIL import Image, ImageDraw, ImageFont

from backend.documents.models import Document
from backend.screening.models import WatchlistEntry

User = get_user_model()


# ---------------------------------------------------------------------------
# The seven IDs, in card order
# ---------------------------------------------------------------------------

TEST_IDS = [
    {
        "username": "tapambwa_misheck",
        "surname": "TAPAMBWA",
        "first_name": "MISHECK BRANDON",
        "id_number": "63-2328252 R 80",
        "district_suffix": "CIT M",
        "dob": "28/05/2003",
        "village": "MARECHA",
        "place_of_birth": "HARARE",
        "date_of_issue": "31/01/2020",
        "sex": "M",
    },
    {
        "username": "gweme_blessing",
        "surname": "GWEME",
        "first_name": "BLESSING TAFADZWA",
        "id_number": "37-2006769 H 83",
        "district_suffix": "CIT F",
        "dob": "30/04/2003",
        "village": "GWEME",
        "place_of_birth": "KARIBA",
        "date_of_issue": "14/02/2022",
        "sex": "F",
    },
    {
        "username": "nhende_tapiwanashe",
        "surname": "NHENDE",
        "first_name": "TAPIWANASHE",
        "id_number": "58-2050245 J 07",
        "district_suffix": "CIT M",
        "dob": "01/01/2004",
        "village": "DENYA",
        "place_of_birth": "KWEKWE",
        "date_of_issue": "24/01/2022",
        "sex": "M",
    },
    {
        "username": "angoni_trinity",
        "surname": "ANGONI",
        "first_name": "TRINITY",
        "id_number": "75-392520 Q 75",
        "district_suffix": "CIT M",
        "dob": "31/10/1987",
        "village": "CHEGORE",
        "place_of_birth": "MUTARE",
        "date_of_issue": "03/11/2014",
        "sex": "M",
    },
    {
        "username": "mahundi_agnes",
        "surname": "MAHUNDI",
        "first_name": "AGNES",
        "id_number": "75-2702602 Z 75",
        "district_suffix": "CIT F",
        "dob": "21/05/1970",
        "village": "CHEGORE",
        "place_of_birth": "MUTARE",
        "date_of_issue": "12/08/2015",
        "sex": "F",
    },
    {
        "username": "chikomba_hellen",
        "surname": "CHIKOMBA",
        "first_name": "HELLEN RUFARO",
        "id_number": "63-2316316 S 50",
        "district_suffix": "CIT F",
        "dob": "13/08/2002",
        "village": "NYATSANZA",
        "place_of_birth": "HARARE",
        "date_of_issue": "26/03/2020",
        "sex": "F",
    },
    {
        "username": "angoni_terrence",
        "surname": "ANGONI",
        "first_name": "TERRENCE",
        "id_number": "75-353227 F 75",
        "district_suffix": "CIT M",
        "dob": "16/06/1984",
        "village": "CHEGORE",
        "place_of_birth": "MUTARE",
        "date_of_issue": "25/02/2003",
        "sex": "M",
    },
]

# Watchlist entries — exact ID match on two, fuzzy name on one more.
WATCHLIST = [
    {"id": "75-392520 Q 75", "name": "TRINITY ANGONI",
     "reason": "sanctions list — sample"},
    {"id": "63-2316316 S 50", "name": "HELLEN RUFARO CHIKOMBA",
     "reason": "PEP list — sample"},
    {"id": "", "name": "TERRENCE ANGONI",
     "reason": "adverse media — sample"},
]


# ---------------------------------------------------------------------------
# Card renderer
# ---------------------------------------------------------------------------

CARD_W, CARD_H = 1012, 638


def _find_font(size: int):
    """Best-effort TrueType font. Falls back to PIL default if none found."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render_card(p: dict) -> bytes:
    """
    Render a PNG that visually resembles a Zimbabwe National ID card:
    yellow header stripe, header text, photo placeholder on the left,
    labelled fields on the right.
    """
    img = Image.new("RGB", (CARD_W, CARD_H), color=(252, 250, 240))
    draw = ImageDraw.Draw(img)

    font_header = _find_font(26)
    font_title = _find_font(20)
    font_label = _find_font(16)
    font_value = _find_font(22)

    # Yellow header stripe
    draw.rectangle([(0, 0), (CARD_W, 70)], fill=(255, 210, 0))

    # Header text
    draw.text((30, 12), "REPUBLIC OF ZIMBABWE", fill=(150, 20, 20), font=font_header)
    draw.text((30, 42), "NATIONAL REGISTRATION", fill=(20, 20, 20), font=font_title)

    # Photo placeholder — grey rectangle with a person silhouette
    draw.rectangle([(30, 100), (280, 480)], fill=(210, 215, 220), outline=(120, 120, 120), width=3)
    draw.ellipse([(120, 150), (200, 230)], fill=(150, 155, 165))
    draw.polygon(
        [(60, 450), (250, 450), (240, 340), (200, 260), (120, 260), (70, 340)],
        fill=(150, 155, 165),
    )

    # Right-side fields
    x_label = 320
    x_value = 620
    y = 110
    line_h = 44

    rows = [
        ("ID NUMBER", f"{p['id_number']} {p['district_suffix']}"),
        ("SURNAME", p["surname"]),
        ("FIRST NAME", p["first_name"]),
        ("DATE OF BIRTH", p["dob"]),
        ("VILLAGE OF ORIGIN", p["village"]),
        ("PLACE OF BIRTH", p["place_of_birth"]),
        ("DATE OF ISSUE", p["date_of_issue"]),
    ]
    for label, value in rows:
        draw.text((x_label, y + 4), label, fill=(60, 60, 60), font=font_label)
        draw.text((x_value, y), value, fill=(10, 10, 10), font=font_value)
        y += line_h

    # Signature block
    y += 20
    draw.text((x_label, y), "Signature of Holder", fill=(150, 20, 20), font=font_label)
    draw.line([(x_value, y + 24), (x_value + 200, y + 24)], fill=(60, 60, 60), width=1)

    # Fingerprint block on the right
    draw.rectangle([(880, 460), (980, 560)], outline=(150, 20, 20), width=2)
    draw.text((892, 570), "Fingerprint", fill=(150, 20, 20), font=font_label)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Command
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = "Seed seven real-world Zimbabwe ID cards as test customers."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing test users and their documents first.",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts["reset"]:
            usernames = [p["username"] for p in TEST_IDS]
            User.objects.filter(username__in=usernames).delete()
            self.stdout.write(
                self.style.WARNING(f"Deleted {len(usernames)} existing test users.")
            )

        created_users = 0
        created_docs = 0
        seeded_profiles = 0

        for p in TEST_IDS:
            user, u_created = User.objects.get_or_create(
                username=p["username"],
                defaults={
                    "email": f"{p['username']}@test.kyc",
                    "first_name": p["first_name"].split()[0],
                    "last_name": p["surname"],
                    "nationality": "ZW",
                },
            )
            if u_created:
                user.set_password("Test-Pass-1234!")
                user.save()
                created_users += 1

            # Save the rendered PNG as the customer's document.
            filename = f"{p['username']}_id.png"
            existing = Document.objects.filter(
                customer=user, file__endswith=filename,
            ).first()
            if existing is None:
                png = render_card(p)
                doc = Document.objects.create(
                    customer=user,
                    doc_type="national_id",
                )
                doc.file.save(filename, ContentFile(png), save=True)
                created_docs += 1
            else:
                doc = existing


            self.stdout.write(
                f"  {p['username']:24s} "
                f"({p['id_number']} {p['district_suffix']}) "
                f"doc #{doc.pk}"
            )

        # Watchlist
        created_wl = 0
        for entry in WATCHLIST:
            _, wl_created = WatchlistEntry.objects.get_or_create(
                entry={
                    "id": entry["id"],
                    "name": entry["name"],
                    "reason": entry["reason"],
                },
            )
            if wl_created:
                created_wl += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. "
                f"users: {created_users} created, "
                f"documents: {created_docs} created, "
                f"profiles: {seeded_profiles} seeded, "
                f"watchlist: {created_wl} added."
            )
        )
        self.stdout.write("")
        self.stdout.write("Next steps:")
        self.stdout.write("  1. Open /documents in the browser.")
        self.stdout.write("  2. Click any document, then 'Re-run verification'.")
        self.stdout.write(
            "  3. Watch the 10-step pipeline run. ANGONI TRINITY and "
            "CHIKOMBA HELLEN will MATCH the watchlist; the rest CLEAR."
        )