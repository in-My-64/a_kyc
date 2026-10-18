from __future__ import annotations

from statistics import mean

import cv2
import numpy as np

from ..types import RawRead


class PaddleEngine:
    """
    Recognition-only PaddleOCR (we already have the crop, so skip detection).

    `psm` is accepted for interface compatibility with TesseractEngine and
    silently ignored — Paddle has no page-segmentation concept.
    """

    name = "paddle"

    def __init__(self, weight: float = 1.0, lang: str = "en"):
        from paddleocr import PaddleOCR

        self.weight = weight
        self._ocr = PaddleOCR(use_angle_cls=False, lang=lang, show_log=False)

    def read(
        self,
        image: np.ndarray,
        whitelist: str | None = None,
        psm: int = 7,  # noqa: ARG002 — see class docstring
    ) -> RawRead:
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        res = self._ocr.ocr(image, det=False, cls=False)
        items = res[0] if res else []
        if not items:
            return RawRead("", 0.0)
        text = " ".join(t for t, _ in items)
        if whitelist:
            text = "".join(ch for ch in text if ch in whitelist or ch == " ")
        return RawRead(text, mean(c for _, c in items))