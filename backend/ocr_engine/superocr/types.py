from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np


@dataclass(frozen=True)
class Box:
    x1: int
    y1: int
    x2: int
    y2: int

    def padded(self, px: int, w: int, h: int) -> "Box":
        return Box(max(0, self.x1 - px), max(0, self.y1 - px),
                   min(w, self.x2 + px), min(h, self.y2 + px))

    @property
    def width(self) -> int:
        return self.x2 - self.x1

    @property
    def height(self) -> int:
        return self.y2 - self.y1

    def is_usable(self, min_px: int = 4) -> bool:
        """False for zero/negative-area boxes (e.g. a detection clamped off the card edge)."""
        return self.width >= min_px and self.height >= min_px

    def crop(self, img: "np.ndarray") -> "np.ndarray":
        return img[self.y1:self.y2, self.x1:self.x2]

    @classmethod
    def from_fractions(cls, frac: tuple[float, float, float, float], w: int, h: int) -> "Box":
        x1, y1, x2, y2 = frac
        return cls(int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h))


@dataclass(frozen=True)
class Detection:
    label: str
    box: Box
    conf: float


@dataclass(frozen=True)
class RawRead:
    """What an engine returns for one crop."""
    text: str
    conf: float  # 0..1


@dataclass(frozen=True)
class Reading:
    """A RawRead tagged with where it came from."""
    text: str
    conf: float
    engine: str
    variant: str


@dataclass
class FieldResult:
    name: str
    value: str | None
    agreement: float          # weight of winning value / weight of all readings
    confidence: float         # mean engine confidence of winners * agreement
    votes: int                # readings that produced the winning value
    source: str               # "yolo" | "layout"
    readings: list[Reading] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    engines: int = 0          # DISTINCT engines behind the winning value (votes can repeat one engine)


@dataclass
class CardResult:
    fields: dict[str, FieldResult]
    issues: list[str]
    card_found: bool
    quality: dict[str, float]