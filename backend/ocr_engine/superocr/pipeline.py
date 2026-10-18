from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

import cv2
import numpy as np

from .detect import Detector
from .dewarp import CARD_H, CARD_W, dewarp, find_card_quad
from .engines.base import OCREngine
from .enhance import prepare_crop, quality, variants
from .fields import ZW_NATIONAL_ID, FieldSpec, validate_cross_fields
from .types import Box, CardResult, Detection, FieldResult, Reading
from .vote import VoteOutcome, vote

log = logging.getLogger(__name__)

Fallback = Callable[[np.ndarray, FieldSpec], Optional[str]]

MIN_BOX_PX = 4  # a crop thinner than this cannot hold a line of text

# PSM used by the last-resort recovery pass when a field's primary read
# returns nothing. Sparse text mode finds fragments PSM 7 may have skipped.
RECOVERY_PSM = 11

# Variant used by the recovery pass. The 2x variant is what small text
# actually needs, and it's the one most likely to yield a valid value
# when the standard variants didn't.
RECOVERY_VARIANT = "2x"


@dataclass
class PipelineConfig:
    early_exit: float = 0.75
    min_blur: float = 60.0
    max_glare: float = 0.08
    pad_px: int = 6
    enable_recovery: bool = True


def _best(dets: Iterable[Detection], label: str) -> Detection | None:
    return max((d for d in dets if d.label == label), key=lambda d: d.conf, default=None)


def _rotate_card(img: np.ndarray, degrees: int) -> np.ndarray:
    """Return `img` rotated clockwise by `degrees` (0, 90, 180, or 270)."""
    if degrees == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if degrees == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if degrees == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


class SuperOCR:
    def __init__(self, detector: Detector, engines: list[OCREngine],
                 specs: dict[str, FieldSpec] | None = None, config: PipelineConfig | None = None,
                 fallback: Fallback | None = None, debug_dir: str | None = None):
        self.detector = detector
        self.engines = engines
        self.specs = specs or ZW_NATIONAL_ID
        self.cfg = config or PipelineConfig()
        self.fallback = fallback
        self.debug_dir = debug_dir
        self.weights = {e.name: e.weight for e in engines}
        self.weights["fallback"] = 1.0

    def run(self, image: np.ndarray) -> CardResult:
        issues: list[str] = []
        card, found = self._extract_card(image)

        if not found:
            # Do NOT proceed with card-relative layout boxes on an image
            # where no card was detected. Every fraction box lands on the
            # wrong pixels, but the field normalizers still accept whatever
            # they read, so the result LOOKS like a successful extraction
            # (e.g. "NAMEHELLENRUFART TARGA" from a resized full-page PDF).
            # Confident garbage is worse than a clean failure: the caller
            # cannot tell a real extraction from a fabricated one.
            #
            # Return empty fields instead. The caller (classify_document_v2)
            # checks `card_found` and falls back to the v1 whole-image OCR
            # text, which does not need a detected card to read correctly.
            log.info("card not detected; returning empty result for fallback")
            q = quality(image)
            issues.append("card_not_found")
            return CardResult(
                fields={
                    name: FieldResult(
                        name=name,
                        value=None,
                        agreement=0.0,
                        confidence=0.0,
                        votes=0,
                        source="layout",
                        issues=[f"{name}_no_card"],
                    )
                    for name in self.specs
                },
                issues=issues,
                card_found=False,
                quality=q,
            )

        card, dets = self._orient(card)

        q = quality(card)
        if q["blur"] < self.cfg.min_blur:
            issues.append("image_blurry")
        if q["glare"] > self.cfg.max_glare:
            issues.append("image_glare")

        vs = variants(card)
        h, w = card.shape[:2]
        fields: dict[str, FieldResult] = {}
        boxes: dict[str, Box] = {}
        for spec in self.specs.values():
            det = _best(dets, spec.name)
            if det:
                box, source = det.box.padded(self.cfg.pad_px, w, h), "yolo"
            else:
                box, source = Box.from_fractions(spec.layout, w, h), "layout"
            boxes[spec.name] = box
            fields[spec.name] = self._read_field(spec, box, source, vs, card)

        issues.extend(validate_cross_fields({n: f.value for n, f in fields.items()}))

        if self.debug_dir:
            self._debug(card, boxes, fields)
        return CardResult(fields=fields, issues=issues, card_found=found, quality=q)

    def _extract_card(self, image: np.ndarray) -> tuple[np.ndarray, bool]:
        region = image
        det = _best(self.detector.detect(image), "card")
        if det:
            h, w = image.shape[:2]
            region = det.box.padded(int(0.03 * max(h, w)), w, h).crop(image)
        quad = find_card_quad(region)
        if quad is not None:
            return dewarp(region, quad), True
        return cv2.resize(region, (CARD_W, CARD_H), interpolation=cv2.INTER_CUBIC), det is not None

    def _orient(self, card: np.ndarray) -> tuple[np.ndarray, list[Detection]]:
        """
        Dewarp leaves the card at some multiple of 90°. Find the upright one.

        With a detector: the holder photo sits on the left; if YOLO finds it
        on the right, the card is 180° off.

        Without one: try all four 90° rotations, score each by the vote
        confidence of the id_number layout box, and keep the winner. That
        covers 180° (upside-down) and 90°/270° (sideways) in one pass — the
        sideways case matters because rasterized PDFs routinely place a
        landscape card on a portrait page.
        """
        dets = self.detector.detect(card)
        photo = _best(dets, "photo")
        if photo is not None:
            if (photo.box.x1 + photo.box.x2) / 2 > card.shape[1] / 2:
                card = cv2.rotate(card, cv2.ROTATE_180)
                dets = self.detector.detect(card)
            return card, dets

        best_angle = self._best_rotation(card)
        if best_angle != 0:
            log.info("orientation search: rotating card by %d°", best_angle)
            card = _rotate_card(card, best_angle)
            dets = self.detector.detect(card)
        return card, dets

    def _best_rotation(self, card: np.ndarray) -> int:
        """Pick the clockwise rotation (0/90/180/270) where id_number reads best."""
        spec = self.specs.get("id_number")
        if spec is None:
            return 0
        best_angle = 0
        best_score = -1.0
        for angle in (0, 90, 180, 270):
            candidate = _rotate_card(card, angle)
            score = self._orientation_score(candidate, spec)
            if score > best_score:
                best_score = score
                best_angle = angle
        return best_angle

    def _orientation_score(self, card: np.ndarray, spec: FieldSpec) -> float:
        """Vote confidence of a single quick read of `spec` at its layout box. 0.0 if nothing valid."""
        h, w = card.shape[:2]
        box = Box.from_fractions(spec.layout, w, h)
        if not box.is_usable(MIN_BOX_PX):
            return 0.0
        try:
            crop = prepare_crop(box.crop(variants(card)["flat"]))
        except cv2.error:
            return 0.0
        readings: list[Reading] = []
        for eng in self.engines:
            try:
                raw = eng.read(crop, spec.whitelist, psm=spec.psm)
            except Exception:
                log.exception("engine %s failed during orientation check", eng.name)
                continue
            readings.append(Reading(raw.text, raw.conf, eng.name, "flat"))
        return vote(readings, spec.normalize, self.weights).confidence

    def _read_field(self, spec: FieldSpec, box: Box, source: str,
                    vs: dict[str, np.ndarray], card: np.ndarray) -> FieldResult:
        if not box.is_usable(MIN_BOX_PX):
            return FieldResult(name=spec.name, value=None, agreement=0.0, confidence=0.0,
                               votes=0, source=source, issues=[f"{spec.name}_box_invalid"])

        readings: list[Reading] = []
        out = VoteOutcome(None, 0.0, 0.0, 0, False, 0)
        need = max(2, spec.min_votes)
        eng_need = min(spec.min_engines, len(self.engines))

        for vname, img in vs.items():
            try:
                crop = prepare_crop(box.crop(img))
            except cv2.error:
                log.exception("crop failed on %s/%s", spec.name, vname)
                continue
            for eng in self.engines:
                try:
                    raw = eng.read(crop, spec.whitelist, psm=spec.psm)
                except Exception:
                    log.exception("engine %s failed on %s/%s", eng.name, spec.name, vname)
                    continue
                readings.append(Reading(raw.text, raw.conf, eng.name, vname))
            out = vote(readings, spec.normalize, self.weights)
            if (out.value and out.votes >= need and out.engines >= eng_need
                    and out.agreement >= self.cfg.early_exit and not out.conflict):
                break

        if out.value is None and self.cfg.enable_recovery:
            recovery_img = vs.get(RECOVERY_VARIANT)
            if recovery_img is not None:
                try:
                    crop = prepare_crop(box.crop(recovery_img))
                except cv2.error:
                    crop = None
                if crop is not None:
                    for eng in self.engines:
                        try:
                            raw = eng.read(
                                crop, whitelist=None, psm=RECOVERY_PSM,
                            )
                        except Exception:
                            log.exception(
                                "recovery pass failed on %s via %s",
                                spec.name, eng.name,
                            )
                            continue
                        readings.append(
                            Reading(raw.text, raw.conf, eng.name,
                                    f"{RECOVERY_VARIANT}-psm{RECOVERY_PSM}"),
                        )
                    out = vote(readings, spec.normalize, self.weights)

        weak = (out.value is None or out.conflict or out.votes < spec.min_votes
                or out.engines < eng_need)
        if weak and self.fallback:
            try:
                text = self.fallback(box.crop(card), spec)
            except Exception:
                log.exception("fallback failed on %s", spec.name)
                text = None
            if text:
                readings.append(Reading(text, 0.5, "fallback", "card"))
                out = vote(readings, spec.normalize, self.weights)

        issues: list[str] = []
        if out.value is None:
            issues.append(f"{spec.name}_unreadable")
        else:
            if out.votes < spec.min_votes:
                issues.append(f"{spec.name}_low_agreement")
            if out.engines < spec.min_engines:
                issues.append(f"{spec.name}_insufficient_engines")
            if out.conflict:
                issues.append(f"{spec.name}_conflicting_readings")

        return FieldResult(name=spec.name, value=out.value, agreement=out.agreement,
                           confidence=out.confidence, votes=out.votes, source=source,
                           readings=readings, issues=issues, engines=out.engines)

    def _debug(self, card: np.ndarray, boxes: dict[str, Box], fields: dict[str, FieldResult]) -> None:
        # NOTE: these images contain PII. Enable only in dev.
        os.makedirs(self.debug_dir, exist_ok=True)
        vis = card.copy()
        for name, b in boxes.items():
            colour = (0, 180, 0) if fields[name].value else (0, 0, 255)
            cv2.rectangle(vis, (b.x1, b.y1), (b.x2, b.y2), colour, 2)
            cv2.putText(vis, f"{name}:{fields[name].value or '?'}", (b.x1, max(14, b.y1 - 4)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)
        cv2.imwrite(os.path.join(self.debug_dir, f"card_{int(time.time() * 1000)}.png"), vis)