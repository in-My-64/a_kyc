import cv2
import numpy as np
import pytest

from backend.ocr_engine.superocr import enhance
from backend.ocr_engine.superocr.dewarp import CARD_H, CARD_W, find_card_quad, quad_aspect
from backend.ocr_engine.superocr.fields import (
    ZW_NATIONAL_ID,
    normalize_date,
    normalize_name,
    normalize_zw_id,
    validate_cross_fields,
)
from backend.ocr_engine.superocr.pipeline import SuperOCR
from backend.ocr_engine.superocr.types import Box, Detection, RawRead, Reading
from backend.ocr_engine.superocr.vote import vote

W = {"tesseract": 1.0, "paddle": 1.0}


# --------------------------------------------------------------------------
# Normalizers (original tests, unchanged)
# --------------------------------------------------------------------------

def test_id_dollar_read_as_S():
    assert normalize_zw_id("63-2316316 $ 50") == "63-2316316 S 50"


def test_id_without_suffix_is_rejected_not_truncated():
    assert normalize_zw_id("63-2316316 S") is None


def test_id_position_aware_repair():
    assert normalize_zw_id("63-23I63I6 S 5O") == "63-2316316 S 50"


def test_id_separators_irrelevant():
    assert normalize_zw_id("632316316S50") == "63-2316316 S 50"


def test_dob_valid():
    assert normalize_date("13/08/2002", "dob") == "13/08/2002"


def test_dob_impossible_day_rejected_not_guessed():
    assert normalize_date("73/08/2002", "dob") is None


def test_dob_letters_in_digit_slots():
    assert normalize_date("I3/O8/2OO2", "dob") == "13/08/2002"


def test_dob_future_rejected():
    assert normalize_date("01/01/2999", "dob") is None


def test_name_strips_labels_and_noise():
    assert normalize_name("SURNAME CHIKOMBA,") == "CHIKOMBA"


def test_name_rejects_digit_garbage():
    assert normalize_name("63-2316316 $ 50") is None


# --------------------------------------------------------------------------
# Normalizers: regressions for the review findings
# --------------------------------------------------------------------------

def test_id_six_digit_body():
    assert normalize_zw_id("63-231631 S 50") == "63-231631 S 50"


@pytest.mark.parametrize("raw", ["M4RY", "J0HN3", "CH1K9MBA", "TAND7"])
def test_name_unrepairable_digit_rejects_instead_of_dropping_chars(raw):
    # Previously "M4RY" -> "RY": a wrong value that looks valid and can win a vote.
    assert normalize_name(raw) is None


def test_name_repairable_digits_still_repaired():
    assert normalize_name("J0HN") == "JOHN"
    assert normalize_name("CH1KOMBA") == "CHIKOMBA"


def test_name_single_letter_noise_token_still_dropped():
    assert normalize_name("JOHN M") == "JOHN"


def test_cross_fields_flags():
    assert validate_cross_fields({"dob": "13/08/2002", "date_of_issue": "01/01/2001"}) == [
        "date_of_issue_not_after_dob"
    ]
    assert validate_cross_fields({"dob": "13/08/2002", "date_of_issue": "01/01/2010"}) == [
        "issued_before_age_16"
    ]
    assert validate_cross_fields({"dob": "13/08/2002", "date_of_issue": "01/01/2019"}) == []
    assert validate_cross_fields({"dob": None, "date_of_issue": "01/01/2019"}) == []


# --------------------------------------------------------------------------
# vote
# --------------------------------------------------------------------------

def R(text, engine="tesseract", variant="flat", conf=0.9):
    return Reading(text, conf, engine, variant)


def test_vote_valid_reading_beats_invalid_one():
    dob = lambda r: normalize_date(r, "dob")
    out = vote([R("73/08/2002"), R("13/08/2002", "paddle"), R("13/08/2002", variant="clahe")], dob, W)
    assert out.value == "13/08/2002" and out.votes == 2 and not out.conflict
    assert out.agreement == pytest.approx(2 / 3)


def test_vote_flags_conflicting_valid_values():
    dob = lambda r: normalize_date(r, "dob")
    out = vote([R("13/08/2002"), R("18/08/2002", "paddle")], dob, W)
    assert out.conflict


def test_vote_nothing_valid():
    out = vote([R("garbage")], normalize_zw_id, W)
    assert out.value is None and out.votes == 0 and out.engines == 0


def test_vote_one_engine_two_variants_is_two_votes_but_one_engine():
    out = vote([R("13/08/2002", variant="flat"), R("13/08/2002", variant="clahe")],
               lambda r: normalize_date(r, "dob"), W)
    assert out.votes == 2 and out.engines == 1


def test_vote_two_engines_counted_independently():
    out = vote([R("13/08/2002"), R("13/08/2002", "paddle")],
               lambda r: normalize_date(r, "dob"), W)
    assert out.votes == 2 and out.engines == 2


# --------------------------------------------------------------------------
# dewarp / card finding
# --------------------------------------------------------------------------

def _frame(card_wh, frame_wh=(1400, 1000), bg=60):
    frame = np.full((frame_wh[1], frame_wh[0], 3), bg, np.uint8)
    cw, ch = card_wh
    x0, y0 = (frame_wh[0] - cw) // 2, (frame_wh[1] - ch) // 2
    cv2.rectangle(frame, (x0, y0), (x0 + cw, y0 + ch), (255, 255, 255), -1)
    return frame


def test_card_shaped_region_found():
    quad = find_card_quad(_frame((CARD_W, CARD_H)))
    assert quad is not None
    assert quad_aspect(quad) == pytest.approx(CARD_W / CARD_H, rel=0.05)


def test_square_page_rejected_not_dewarped_into_a_card():
    assert find_card_quad(_frame((700, 700))) is None


def test_very_wide_strip_rejected():
    assert find_card_quad(_frame((1200, 300))) is None


# --------------------------------------------------------------------------
# lazy variants
# --------------------------------------------------------------------------

def test_variants_are_lazy_and_dict_like(monkeypatch):
    calls = []
    real = cv2.fastNlMeansDenoising
    monkeypatch.setattr(enhance.cv2, "fastNlMeansDenoising",
                        lambda *a, **k: (calls.append(1), real(*a, **k))[1])
    card = np.full((CARD_H, CARD_W, 3), 200, np.uint8)
    vs = enhance.variants(card)
    assert list(vs) == ["flat", "clahe", "binary", "gray"] and len(vs) == 4
    _ = vs["flat"], vs["clahe"], vs["gray"]
    assert calls == []            # binary (the expensive one) untouched
    assert vs["binary"].shape == card.shape[:2] and calls == [1]
    _ = vs["binary"]
    assert calls == [1]           # cached


# --------------------------------------------------------------------------
# pipeline, with stub engines (no Tesseract/Paddle needed)
# --------------------------------------------------------------------------

ID_TEXT, DATE_TEXT, NAME_TEXT = "63-2316316 S 50", "13/08/2002", "CHIKOMBA"


class InkEngine:
    """Returns a canned, valid reading for a crop iff the crop contains ink."""

    def __init__(self, name="tesseract", weight=1.0):
        self.name, self.weight = name, weight

    def read(self, image, whitelist=None):
        ink = (image < 128).mean() > 0.004
        if not ink:
            return RawRead("", 0.0)
        if whitelist == "0123456789/.-":
            return RawRead(DATE_TEXT, 0.9)
        if whitelist and whitelist.startswith("ABCDEFGHIJKLMNOPQRSTUVWXYZabc"):
            return RawRead(NAME_TEXT, 0.9)
        return RawRead(ID_TEXT, 0.9)


class NoDetector:
    def detect(self, image):
        return []


def _card_photo(upside_down=False):
    """Synthetic card on a table; ink only inside the id_number layout box."""
    frame = _frame((CARD_W, CARD_H))
    x0, y0 = (1400 - CARD_W) // 2, (1000 - CARD_H) // 2
    cv2.putText(frame, ID_TEXT, (x0 + 520, y0 + 165), cv2.FONT_HERSHEY_SIMPLEX,
                1.2, (0, 0, 0), 3, cv2.LINE_AA)
    return cv2.rotate(frame, cv2.ROTATE_180) if upside_down else frame


def _engine(*names):
    return SuperOCR(NoDetector(), [InkEngine(n) for n in names])


def test_pipeline_reads_upright_card():
    res = _engine("tesseract", "paddle").run(_card_photo())
    assert res.card_found
    assert res.fields["id_number"].value == ID_TEXT
    assert res.fields["id_number"].engines == 2
    assert "id_number_insufficient_engines" not in res.fields["id_number"].issues


def test_pipeline_fixes_upside_down_card_without_a_detector():
    # NullDetector path: previously a 180-degree card was read as garbage.
    res = _engine("tesseract", "paddle").run(_card_photo(upside_down=True))
    assert res.fields["id_number"].value == ID_TEXT


def test_single_engine_is_flagged_but_value_kept():
    res = _engine("tesseract").run(_card_photo())
    f = res.fields["id_number"]
    assert f.value == ID_TEXT and f.engines == 1
    assert "id_number_insufficient_engines" in f.issues


def test_two_variants_of_one_engine_do_not_satisfy_min_engines():
    res = _engine("tesseract").run(_card_photo())
    assert res.fields["id_number"].votes >= 2          # min_votes met...
    assert "id_number_insufficient_engines" in res.fields["id_number"].issues  # ...independence not


def test_degenerate_detection_box_does_not_crash_the_run():
    class BadBoxDetector:
        def detect(self, image):
            # x1 > x2 after clamping to the card edge -> empty crop (used to raise cv2.error)
            return [Detection("id_number", Box(2000, 100, 2010, 120), 0.9)]

    res = SuperOCR(BadBoxDetector(), [InkEngine("tesseract"), InkEngine("paddle")]).run(_card_photo())
    assert res.fields["id_number"].value is None
    assert "id_number_box_invalid" in res.fields["id_number"].issues
    # the other fields still ran
    assert set(res.fields) == set(ZW_NATIONAL_ID)


def test_non_card_image_reports_card_not_found():
    square = _frame((700, 700))
    res = _engine("tesseract", "paddle").run(square)
    assert not res.card_found and "card_not_found" in res.issues