"""Process-wide singleton so models load once per Celery worker, not once per task."""
from __future__ import annotations

import logging
import os
from functools import lru_cache

from .detect import NullDetector, YoloDetector
from .engines.tesseract import TesseractEngine
from .pipeline import SuperOCR

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_engine() -> SuperOCR:
    weights = os.environ.get("SUPEROCR_YOLO_WEIGHTS")
    detector = YoloDetector(weights) if weights else NullDetector()
    engines = [TesseractEngine()]
    if os.environ.get("SUPEROCR_PADDLE", "1") == "1":
        try:
            from .engines.paddle import PaddleEngine
            engines.append(PaddleEngine())
        except ImportError:
            log.warning("paddleocr not installed; running with tesseract only")
    return SuperOCR(detector, engines, debug_dir=os.environ.get("SUPEROCR_DEBUG_DIR"))
