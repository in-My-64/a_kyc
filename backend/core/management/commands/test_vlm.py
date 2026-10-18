"""
Smoke-test the VLM backend directly: no Celery, no pipeline, no DB writes.

Checks, in order:
  1. Which URL / model / key state the backend is actually configured with.
  2. GET /api/tags through the tunnel (tests tunnel + proxy + API key).
  3. A real vision call per image (tests the model and the JSON output).

Usage:
    python manage.py test_vlm media/ids_to_test_with/some_id.jpg
    python manage.py test_vlm media/ids_to_test_with --limit 3

Place this file at <app>/management/commands/test_vlm.py
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

# ADJUST THIS IMPORT to wherever OllamaVLMBackend lives in your project.
from backend.ocr_engine.vlm.ollama import OllamaVLMBackend

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

# Smoke-test prompt only. The real pipeline uses its own prompt.
PROMPT = (
    "This is a Zimbabwean national ID card. Read the printed text and return "
    "ONLY a JSON object with the keys: id_number, surname, first_names, "
    "date_of_birth, sex, place_of_birth, date_of_issue. Use null for any "
    "field you cannot read. Do not guess."
)


class Command(BaseCommand):
    help = "Smoke-test the Ollama VLM backend on one image or a folder."

    def add_arguments(self, parser):
        parser.add_argument("path", help="Image file or folder of images.")
        parser.add_argument("--limit", type=int, default=0,
                            help="Max images to run when a folder is given.")
        parser.add_argument("--prompt", default=PROMPT)

    def handle(self, *args, **opts):
        import requests

        backend = OllamaVLMBackend()
        self.stdout.write(
            f"URL: {backend.url}   model: {backend.model}   "
            f"api_key: {'set' if backend.api_key else 'MISSING'}"
        )

        # ---- 1. connectivity + auth -------------------------------------
        try:
            r = requests.get(
                f"{backend.url}/api/tags",
                headers=backend._headers(),
                timeout=(10, 30),
            )
        except requests.RequestException as exc:
            raise CommandError(
                f"cannot reach {backend.url}: {exc}\n"
                "Is the Kaggle notebook running (bootstrap + proxy cells)?"
            )

        self.stdout.write(f"GET /api/tags -> HTTP {r.status_code}")
        if r.status_code != 200:
            raise CommandError(backend._error_body(r))

        names = [m.get("name") for m in r.json().get("models", [])]
        self.stdout.write(f"models on server: {names}")
        if backend.model not in names:
            self.stdout.write(self.style.WARNING(
                f"model {backend.model!r} is not on the server; "
                "the call below will fail until it is pulled"
            ))

        # ---- 2. images ---------------------------------------------------
        p = Path(opts["path"]).resolve()
        if p.is_dir():
            files = sorted(
                f for f in p.iterdir()
                if f.is_file() and f.suffix.lower() in EXTS
            )
            if opts["limit"]:
                files = files[: opts["limit"]]
        elif p.is_file():
            files = [p]
        else:
            raise CommandError(f"not found: {p}")
        if not files:
            raise CommandError(f"no supported images in {p}")

        self.stdout.write(
            f"\nRunning {len(files)} image(s). The first call can take "
            "20-60s while the model loads.\n"
        )

        failures = 0
        for f in files:
            t0 = time.time()
            res = backend.extract(f.read_bytes(), opts["prompt"])
            dt = time.time() - t0

            if res.error:
                failures += 1
                self.stdout.write(self.style.ERROR(
                    f"{f.name}  ({dt:.1f}s)  ERROR: {res.error}"
                ))
                if res.raw_response:
                    self.stdout.write(f"    raw: {res.raw_response[:300]!r}")
            else:
                self.stdout.write(self.style.SUCCESS(f"{f.name}  ({dt:.1f}s)  OK"))
                self.stdout.write(
                    "    " + json.dumps(res.fields, ensure_ascii=False, indent=2)
                    .replace("\n", "\n    ")
                )

        self.stdout.write("")
        self.stdout.write(f"{len(files) - failures} ok, {failures} failed")