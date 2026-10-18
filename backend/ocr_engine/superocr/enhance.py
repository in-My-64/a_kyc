from __future__ import annotations

import cv2
import numpy as np


def variants(card_bgr: np.ndarray) -> dict[str, np.ndarray]:
    """
    Preprocessing variants, ordered by how often they win. Engines vote across
    them, so a glare patch that ruins one variant rarely ruins all four.

    The `2x` variant matters most for small text — the district-code suffix,
    the fingerprint label, thin digits in dates. Tesseract's accuracy falls
    off sharply below ~30px character height; on a 1012x638 card, several
    of these fields sit right at that boundary. Upscaling before OCR
    pushes them comfortably above it. INTER_CUBIC is the interpolation
    Tesseract's own docs recommend for pre-OCR upscaling.
    """
    gray = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2GRAY)
    bg = cv2.medianBlur(cv2.dilate(gray, np.ones((7, 7), np.uint8)), 21)
    flat = cv2.divide(gray, bg, scale=255)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
    denoised = cv2.fastNlMeansDenoising(flat, None, h=10)
    binary = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 12,
    )
    upscaled = cv2.resize(
        flat, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC,
    )
    return {
        "flat": flat,
        "clahe": clahe,
        "binary": binary,
        "gray": gray,
        "2x": upscaled,
    }


def prepare_crop(crop: np.ndarray, min_height: int = 96, border: int = 10) -> np.ndarray:
    """Upscale small crops and pad them; single-line OCR is happier with margins."""
    h = crop.shape[0]
    if h < min_height:
        f = min_height / max(h, 1)
        crop = cv2.resize(crop, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    return cv2.copyMakeBorder(crop, border, border, border, border, cv2.BORDER_REPLICATE)


def quality(card_bgr: np.ndarray) -> dict[str, float]:
    gray = cv2.cvtColor(card_bgr, cv2.COLOR_BGR2GRAY)
    return {
        "blur": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
        "glare": float((gray >= 250).mean()),
        "brightness": float(gray.mean()),
    }