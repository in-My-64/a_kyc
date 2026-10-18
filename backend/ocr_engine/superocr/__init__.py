"""SuperOCR: card detection -> dewarp -> enhance -> field-anchored multi-engine OCR -> voting."""
from .types import Box, CardResult, Detection, FieldResult, RawRead, Reading

__all__ = ["Box", "CardResult", "Detection", "FieldResult", "RawRead", "Reading"]
