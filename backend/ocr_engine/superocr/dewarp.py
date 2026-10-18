from __future__ import annotations

import cv2
import numpy as np

CARD_W, CARD_H = 1012, 638  # ID-1 aspect ratio (85.6 x 53.98 mm)
CARD_ASPECT = CARD_W / CARD_H
# Perspective skews apparent edge lengths, so this is deliberately loose. It exists to reject
# quads that are obviously not a card (a square page, a merged background contour).
ASPECT_TOLERANCE = 0.22


def order_corners(pts) -> np.ndarray:
    """Return corners as top-left, top-right, bottom-right, bottom-left."""
    pts = np.asarray(pts, dtype="float32").reshape(4, 2)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], dtype="float32")


def quad_aspect(quad: np.ndarray) -> float:
    """Long-edge / short-edge ratio of an ordered quad (orientation-independent)."""
    tl, tr, br, bl = quad
    width = max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))
    height = max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))
    return float(max(width, height) / max(min(width, height), 1e-6))


def plausible_card(quad: np.ndarray) -> bool:
    return abs(quad_aspect(quad) - CARD_ASPECT) / CARD_ASPECT <= ASPECT_TOLERANCE


def find_card_quad(img: np.ndarray, min_area_frac: float = 0.15) -> np.ndarray | None:
    """Largest card-like contour as an ordered 4-corner quad, or None (also None if not card-shaped)."""
    h, w = img.shape[:2]
    scale = 800.0 / max(h, w) if max(h, w) > 800 else 1.0
    small = cv2.resize(img, None, fx=scale, fy=scale) if scale != 1.0 else img
    gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    edges = cv2.dilate(cv2.Canny(gray, 40, 120), np.ones((3, 3), np.uint8), iterations=2)
    cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    biggest = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(biggest) < min_area_frac * small.shape[0] * small.shape[1]:
        return None
    hull = cv2.convexHull(biggest)
    approx = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True)
    if len(approx) == 4:
        quad = order_corners(approx.astype("float32") / scale)
    else:
        quad = order_corners(cv2.boxPoints(cv2.minAreaRect(hull)) / scale)
    return quad if plausible_card(quad) else None


def dewarp(img: np.ndarray, quad: np.ndarray, size: tuple[int, int] = (CARD_W, CARD_H)) -> np.ndarray:
    """Perspective-correct `quad` into a flat landscape card of `size`."""
    tl, tr, br, bl = quad
    width = max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))
    height = max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))
    if height > width:                      # card photographed in portrait
        quad = np.roll(quad, -1, axis=0)
    W, H = size
    dst = np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], dtype="float32")
    M = cv2.getPerspectiveTransform(quad.astype("float32"), dst)
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)