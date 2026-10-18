from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class VLMExtraction:
    """What a VLM returns for one ID image."""

    fields: dict[str, str | None] = field(default_factory=dict)
    raw_response: str = ""
    backend: str = ""
    model: str = ""
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.fields)


class VLMBackend(ABC):
    """Abstract base. One implementation per provider."""

    name: str = "base"

    @abstractmethod
    def extract(self, image_bytes: bytes, prompt: str) -> VLMExtraction:
        """
        Send the raw image bytes and prompt to the model, return the
        parsed fields. Implementations MUST NOT raise on API errors;
        they return a VLMExtraction with `error` set instead.
        """
        ...