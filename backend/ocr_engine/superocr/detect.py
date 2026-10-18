from __future__ import annotations

from typing import Protocol

import numpy as np

from .types import Box, Detection


class Detector(Protocol):
    def detect(self, image: np.ndarray) -> list[Detection]: ...


class NullDetector:
    """No model available: the pipeline falls back to contour + layout boxes."""

    def detect(self, image: np.ndarray) -> list[Detection]:
        return []


class YoloDetector:
    """
    Ultralytics YOLO wrapper. One model, two jobs:
      pass 1 on the raw photo   -> class `card`
      pass 2 on the dewarped card -> field classes + `photo` (for orientation)
    Class names must match training/data.yaml.
    """

    def __init__(self, weights: str, conf: float = 0.30, imgsz: int = 960, device: str | None = None):
        from ultralytics import YOLO  # imported lazily so the package works without it

        self._model = YOLO(weights)
        self.conf, self.imgsz, self.device = conf, imgsz, device

    def detect(self, image: np.ndarray) -> list[Detection]:
        res = self._model.predict(image, conf=self.conf, imgsz=self.imgsz,
                                  device=self.device, verbose=False)[0]
        out: list[Detection] = []
        for b in res.boxes:
            x1, y1, x2, y2 = (int(v) for v in b.xyxy[0].tolist())
            out.append(Detection(res.names[int(b.cls[0])], Box(x1, y1, x2, y2), float(b.conf[0])))
        return out
