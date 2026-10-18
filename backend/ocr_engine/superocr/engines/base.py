from __future__ import annotations

from typing import Protocol

import numpy as np

from ..types import RawRead


class OCREngine(Protocol):
    name: str
    weight: float

    def read(
        self,
        image: np.ndarray,
        whitelist: str | None = None,
        psm: int = 7,
    ) -> RawRead:
        """
        Read ONE line of text from a small crop.

        `psm` is Tesseract's page-segmentation mode. Engines that don't
        have an equivalent (PaddleOCR, future models) accept the kwarg and
        ignore it — the protocol exists so callers can pass a
        per-field PSM without branching on engine type.
        """
        ...