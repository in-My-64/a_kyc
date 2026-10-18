from __future__ import annotations

import shlex
from statistics import mean

import numpy as np
import pytesseract
from pytesseract import Output

from ..types import RawRead


class TesseractEngine:
    """Needs Tesseract >= 4.1 so the LSTM engine honours the character whitelist."""

    name = "tesseract"

    def __init__(self, weight: float = 1.0, lang: str = "eng"):
        self.weight, self.lang = weight, lang

    def read(
        self,
        image: np.ndarray,
        whitelist: str | None = None,
        psm: int = 7,
    ) -> RawRead:
        cfg = f"--oem 1 --psm {psm}"
        if whitelist:
            # shlex.quote so a special character in a whitelist can't break
            # pytesseract's internal shlex.split(config). The apostrophe in
            # an earlier _ALPHA was exactly that case.
            cfg += f" -c tessedit_char_whitelist={shlex.quote(whitelist)}"
        d = pytesseract.image_to_data(
            image, lang=self.lang, config=cfg, output_type=Output.DICT,
        )
        words = [
            (w, float(c))
            for w, c in zip(d["text"], d["conf"])
            if w.strip() and float(c) >= 0
        ]
        if not words:
            return RawRead("", 0.0)
        return RawRead(
            " ".join(w for w, _ in words),
            mean(c for _, c in words) / 100.0,
        )