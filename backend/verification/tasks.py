# backend/verification/tasks.py
import re
from datetime import date, datetime
from difflib import SequenceMatcher

from celery import shared_task

from backend.core.tasks import WorkflowTrackingTask
from backend.core.workflow import mark_step
from backend.ocr_engine.models import OCRResult

from .constants import CONFUSION_MAP, ISO_ALPHA2, ISO_ALPHA3, PATTERNS
from .models import ParsedDocument


_DATE_FORMATS = (
    "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d",
    "%d.%m.%Y", "%Y.%m.%d",
)

_NAME_LABEL_ROLES = {
    "SURNAME": "surname",
    "LAST": "surname",
    "LASTNAME": "surname",
    "FAMILY": "surname",
    "FIRST": "given",
    "FIRSTNAME": "given",
    "GIVEN": "given",
    "FORENAME": "given",
    "MIDDLE": "given",
    "NAME": "given",
    "NAMES": "given",
    "HOLDER": None,
}

_NAME_STOPWORDS = {
    "REPUBLIC", "NATIONAL", "IDENTITY", "IDENTIFICATION", "PASSPORT",
    "DRIVER", "LICENCE", "LICENSE", "CARD", "OF", "THE", "AND",
    "DATE", "BIRTH", "SEX", "NATIONALITY", "ISSUED", "EXPIRES",
    "EXPIRY", "MALE", "FEMALE", "SIGNATURE", "AUTHORITY", "GOVERNMENT",
    "REGISTRATION", "VILLAGE", "ORIGIN", "PLACE", "ISSUE", "FINGERPRINT",
    "NUMBER", "NO", "ID",
}

COUNTRY_NAMES = {
    "ZIMBABWE": "ZW",
    "SOUTH AFRICA": "ZA",
    "MOZAMBIQUE": "MZ",
    "ZAMBIA": "ZM",
    "BOTSWANA": "BW",
    "MALAWI": "MW",
    "NAMIBIA": "NA",
    "TANZANIA": "TZ",
    "ANGOLA": "AO",
    "KENYA": "KE",
    "NIGERIA": "NG",
    "GHANA": "GH",
    "EGYPT": "EG",
    "UNITED KINGDOM": "GB",
    "UNITED STATES": "US",
    "INDIA": "IN",
    "CHINA": "CN",
    "PAKISTAN": "PK",
    "BANGLADESH": "BD",
    "BRAZIL": "BR",
    "PORTUGAL": "PT",
    "GERMANY": "DE",
    "FRANCE": "FR",
    "ITALY": "IT",
    "SPAIN": "ES",
    "NETHERLANDS": "NL",
    "AUSTRALIA": "AU",
    "CANADA": "CA",
}

_SHORT_CODE_BLOCKLIST = {
    "ID", "IN", "IS", "IT", "AT", "BE", "BY", "DO", "GO", "HE",
    "IF", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP",
    "US", "WE", "AN", "AS", "AM", "CI", "C1", "SO", "CO",
}

_LABEL_FUZZY_THRESHOLD = 0.75
_KEYWORD_FUZZY_THRESHOLD = 0.75

_TRANSIENT = (OSError,)


# ---------------------------------------------------------------------------
# Fuzzy token matching
# ---------------------------------------------------------------------------

def _fuzzy_eq(tok: str, target: str, threshold: float) -> bool:
    if abs(len(tok) - len(target)) > 2:
        return False
    return SequenceMatcher(None, tok, target).ratio() >= threshold


def _classify_name_label(tok_upper: str) -> str | None:
    if tok_upper in _NAME_LABEL_ROLES:
        return _NAME_LABEL_ROLES[tok_upper]
    for label, role in _NAME_LABEL_ROLES.items():
        if _fuzzy_eq(tok_upper, label, _LABEL_FUZZY_THRESHOLD):
            return role
    return None


def _line_has_keyword(line_upper: str, keywords: tuple[str, ...]) -> bool:
    for kw in keywords:
        if kw in line_upper:
            return True
    for tok in re.findall(r"[A-Z]+", line_upper):
        for kw in keywords:
            if _fuzzy_eq(tok, kw, _KEYWORD_FUZZY_THRESHOLD):
                return True
    return False


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def parse_date(s):
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def is_plausible_dob(d, max_age_years=120):
    if d is None:
        return False
    today = date.today()
    if d > today:
        return False
    age_years = (today - d).days / 365.25
    return 0 <= age_years <= max_age_years


def _candidates(token):
    yield token, {}
    for i, ch in enumerate(token):
        repl = CONFUSION_MAP.get(ch)
        if repl and repl != ch:
            yield token[:i] + repl + token[i + 1:], {i: (ch, repl)}
    full = "".join(CONFUSION_MAP.get(ch, ch) for ch in token)
    if full != token:
        subs = {
            i: (ch, CONFUSION_MAP[ch])
            for i, ch in enumerate(token) if ch in CONFUSION_MAP
        }
        yield full, subs


def _extract_field(text, doc_type, corrections, field):
    if not text:
        return None, corrections, None

    candidates = [doc_type] if doc_type in PATTERNS else list(PATTERNS.keys())
    tokens = [t.strip(",.:;()[]@") for t in re.findall(r"\S+", text)]
    tokens = [t for t in tokens if t]

    for dt in candidates:
        pattern = PATTERNS[dt]
        for i in range(len(tokens)):
            for span in range(1, 4):
                window = " ".join(tokens[i : i + span]).strip()
                if not window:
                    continue
                for variant in (window, window.upper()):
                    for candidate, subs in _candidates(variant):
                        if re.fullmatch(pattern, candidate):
                            if subs:
                                corrections[field] = {
                                    "from": variant,
                                    "to": candidate,
                                    "swaps": {
                                        idx: f"{a}->{b}"
                                        for idx, (a, b) in subs.items()
                                    },
                                }
                            return candidate, corrections, dt
    return None, corrections, None


def _is_name_token(tok: str) -> bool:
    if len(tok) < 2:
        return False
    if not tok.isalpha():
        return False
    upper = tok.upper()
    if upper in _NAME_STOPWORDS:
        return False
    if _classify_name_label(upper) is not None:
        return False
    return tok.isupper() or (tok[:1].isupper() and tok[1:].islower())


def extract_name(text):
    if not text:
        return None

    surname_parts: list[str] = []
    given_parts: list[str] = []
    unlabeled_runs: list[str] = []

    for line in text.splitlines():
        tokens = [t.strip(",.:;()[]@") for t in line.split()]
        tokens = [t for t in tokens if t]
        if not tokens:
            continue

        idx = 0
        roles: list[str] = []
        while idx < len(tokens):
            role = _classify_name_label(tokens[idx].upper())
            if role is None:
                break
            roles.append(role)
            idx += 1

        values = [t for t in tokens[idx:] if _is_name_token(t)]
        if not values:
            continue

        joined = " ".join(values)
        if roles:
            if "surname" in roles:
                surname_parts.append(joined)
            elif "given" in roles:
                given_parts.append(joined)
        else:
            unlabeled_runs.append(joined)

    parts = []
    if given_parts:
        parts.append(" ".join(given_parts))
    if surname_parts:
        parts.append(" ".join(surname_parts))
    if parts:
        return " ".join(parts).strip()

    for run in unlabeled_runs:
        if run:
            return run
    return None


def extract_date_near(text, keywords):
    if not text:
        return None
    keyword_tuple = tuple(keywords)
    for line in text.splitlines():
        if not _line_has_keyword(line.upper(), keyword_tuple):
            continue
        for m in re.finditer(
            r"\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b",
            line,
        ):
            d = parse_date(m.group(1))
            if d:
                return d
    return None


def extract_nationality(text):
    if not text:
        return None

    upper = text.upper()

    for name in sorted(COUNTRY_NAMES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(name)}\b", upper):
            return COUNTRY_NAMES[name]

    for token in re.findall(r"\b[A-Z]{2,3}\b", upper):
        if token in _SHORT_CODE_BLOCKLIST:
            continue
        if token in ISO_ALPHA2 or token in ISO_ALPHA3:
            return token
    return None


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@shared_task(bind=True, base=WorkflowTrackingTask, max_retries=0)
def create_parsed_document(self, ocr_result_id, tracking_id=None):
    """
    Create the ParsedDocument row for this OCRResult and return its id.

    This task exists because the chain has no other step that creates
    the ParsedDocument. It replaces the parsing job that used to be
    done by classify_document_v2, which has been removed from the
    chain now that field extraction is delegated to the vision model.

    Idempotent: uses get_or_create, so a retry or a re-run against the
    same OCRResult finds the existing row.
    """
    mark_step(tracking_id, "create_parsed_document", self.request.id)

    try:
        ocr = OCRResult.objects.select_related("document").get(id=ocr_result_id)
    except OCRResult.DoesNotExist as exc:
        raise ValueError(
            f"OCRResult {ocr_result_id} does not exist"
        ) from exc

    initial_type = getattr(ocr.document, "doc_type", "unknown") or "unknown"
    parsed, _ = ParsedDocument.objects.get_or_create(
        ocr_result=ocr,
        defaults={"doc_type": initial_type},
    )
    return parsed.id


@shared_task(
    bind=True,
    base=WorkflowTrackingTask,
    autoretry_for=_TRANSIENT,
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def classify_document(self, ocr_result_id, tracking_id=None):
    """
    Legacy v1 extraction. Kept for ad-hoc use, but no longer called
    from the workflow chain — the chain now delegates field extraction
    to the vision model via run_vlm_extraction and compare_extractions.

    If you invoke it directly, it behaves as before: reads the OCR
    text, extracts fields via the heuristic extractors above, writes
    them to the ParsedDocument.
    """
    mark_step(tracking_id, "classify_document", self.request.id)

    try:
        ocr = OCRResult.objects.select_related("document").get(id=ocr_result_id)
    except OCRResult.DoesNotExist as exc:
        raise ValueError(
            f"OCRResult {ocr_result_id} does not exist"
        ) from exc

    initial_type = getattr(ocr.document, "doc_type", "unknown") or "unknown"
    parsed, _ = ParsedDocument.objects.get_or_create(
        ocr_result=ocr,
        defaults={"doc_type": initial_type},
    )

    text = ocr.extracted_text or ""
    corrections: dict = {}
    issues: list[str] = []

    id_number, corrections, matched_type = _extract_field(
        text, parsed.doc_type, corrections, "id_number",
    )
    parsed.id_number = id_number
    if matched_type:
        parsed.doc_type = matched_type

    parsed.name = extract_name(text)

    raw_dob = extract_date_near(text, ["BIRTH", "DOB"])
    if raw_dob and not is_plausible_dob(raw_dob):
        issues.append(
            f"dob_implausible: extracted {raw_dob.isoformat()} is a future "
            f"date or implies an age outside 0-120 years"
        )
        raw_dob = None
    parsed.dob = raw_dob

    parsed.expiry = extract_date_near(text, ["EXPIR", "VALID"])
    parsed.nationality = extract_nationality(text)

    if not parsed.id_number and not parsed.name:
        issues.append("extraction_empty: no id_number and no name extracted")

    parsed.corrections = corrections
    parsed.verification_issues = issues
    parsed.save(update_fields=[
        "doc_type",
        "id_number",
        "name",
        "dob",
        "expiry",
        "nationality",
        "corrections",
        "verification_issues",
        "updated_at",
    ])

    return parsed.id