# SuperOCR

Card detection → dewarp → multi-variant enhancement → field-anchored
multi-engine OCR → per-field voting, for the Zimbabwe National ID (extend
via `fields.py` for other doc types).

## Why this exists
The original pipeline OCR'd the whole photo once and regex-matched the
result. Two failures came out of that on one real card:
- `S` (the ID's check letter) was read as `$`, and the trailing `50`
  district code was dropped — the old code made the suffix optional and
  silently stored a truncated ID.
- `13/08/2002` was read as `73/08/2002` — an impossible day, silently
  dropped with no record of why.

SuperOCR fixes this by (a) reading each field on its own, cropped and
upscaled, with two OCR engines across four preprocessing variants, and
(b) voting on **canonical, validated** values rather than raw strings, so
`63-2316316 $ 50`, `632316316S50`, and `63-23I63I6 S 5O` all count as one
vote for `63-2316316 S 50`, and a value that fails validation (like day 73)
never wins a vote at all — instead of being guessed at, it's the reported
`_unreadable` / `_low_agreement` issue.

## Install
    pip install opencv-python-headless numpy pytesseract
    # optional, adds a second voting engine:
    pip install paddleocr
    # optional, adds the field detector (see training/README.md):
    pip install ultralytics
    export SUPEROCR_YOLO_WEIGHTS=/path/to/best.pt

Without YOLO weights set, `NullDetector` is used and fields fall back to
the fixed-layout boxes in `fields.py` — tune those against your own card
photos using the debug overlay (`SUPEROCR_DEBUG_DIR=/tmp/superocr_debug`).

## Wire it in
`tasks.py` exposes `classify_document_v2`, a drop-in Celery task with the
same signature as the original `classify_document`. Point your workflow at
it once you're happy with accuracy on your own sample set; the original
task is untouched, so you can run both side by side and compare
`verification_issues` before cutting over.

## Layout
| File | Responsibility |
|---|---|
| `detect.py` | `Detector` protocol + `NullDetector` + `YoloDetector` |
| `dewarp.py` | contour-based corner finding, perspective correction |
| `enhance.py` | illumination flattening, CLAHE, denoise/binarize, crop prep |
| `engines/` | `OCREngine` protocol + Tesseract and PaddleOCR adapters |
| `fields.py` | per-field regex-free validators/normalizers + layout fallback boxes |
| `vote.py` | canonical-value voting across engines/variants, conflict detection |
| `pipeline.py` | orchestration: detect → dewarp → orient → per-field read+vote → debug overlay |
| `adapter.py` | maps a `CardResult` onto your `ParsedDocument` row |
| `factory.py` | process-wide singleton so models load once per worker |
| `tasks.py` | Celery task, same shape as the original `classify_document` |
| `training/` | YOLO class list + annotation/training instructions |

## Extending to passports / licences
Add a new `dict[str, FieldSpec]` in `fields.py` (own layout boxes, own
`normalize_*` functions) and pass it as `specs=` to `SuperOCR(...)`, or
branch on `doc_type` in `factory.get_engine()`.

## Known limits
- Layout boxes are seed values from one sample photo — recalibrate them,
  or train the YOLO detector, on your own data before trusting agreement
  scores.
- `YoloDetector` uses Ultralytics (AGPL-3.0). For a closed-source product,
  either get their commercial licence or swap in an Apache-licensed
  detector (YOLOX, RT-DETR) — `Detector` is a two-method Protocol.
- No VLM fallback is wired by default; pass `fallback=` to `SuperOCR` for
  low-agreement escalation once you have one available.
