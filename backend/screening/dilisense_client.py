# backend/screening/dilisense_client.py
"""
Dilisense /checkIndividual client.

Endpoint:  GET https://api.dilisense.com/v1/checkIndividual
Auth:      x-api-key header
Envelope:  {"timestamp", "total_hits", "found_records": [...]}

Field extraction inside `found_records[]` is defensively coded — the
empty-response envelope is verified, the hit-record shape is not.
Every extraction helper tries multiple plausible keys.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import requests
from django.conf import settings

log = logging.getLogger(__name__)

_TIMEOUT = (10, 30)
_DEFAULT_THRESHOLD = 0.80
_MATCH_BAND = 0.95


@dataclass
class SanctionsMatch:
    """Provider-agnostic match record — same shape as the OpenSanctions one."""
    entity_id: str
    caption: str
    score: float
    schema: str
    topics: list[str] = field(default_factory=list)
    datasets: list[str] = field(default_factory=list)
    raw: dict = field(default_factory=dict)


@dataclass
class ScreeningOutcome:
    status: str
    matches: list[SanctionsMatch]
    parsed_query: dict | None = None
    raw_response: dict | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Defensive field extraction. Each helper tries multiple plausible keys.
# ---------------------------------------------------------------------------

def _pick(record: dict, *keys: str, default=None):
    for k in keys:
        v = record.get(k)
        if v is not None and v != "":
            return v
    return default


def _score(record: dict) -> float:
    # ← verify: real key may be "match_score", "score", or "confidence"
    raw = _pick(record, "match_score", "score", "confidence", default=0.0)
    try:
        s = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if s > 1.0:
        s = s / 100.0
    return max(0.0, min(1.0, s))


def _entity_id(record: dict) -> str:
    # ← verify
    return str(_pick(record, "id", "record_id", "entity_id", default=""))


def _caption(record: dict) -> str:
    # ← verify
    name = _pick(record, "name", "caption", "full_name")
    if name:
        return str(name)
    names = record.get("names")
    if isinstance(names, list) and names:
        return str(names[0])
    return ""


def _schema(record: dict) -> str:
    # ← verify
    return str(_pick(record, "type", "schema", "entity_type", default=""))


def _topics(record: dict) -> list[str]:
    """
    Derive OpenSanctions-style topic strings from Dilisense's structured
    sections, so the frontend renders both providers identically.
    """
    topics: list[str] = []
    if record.get("sanctions"):
        topics.append("sanction")
    if record.get("pep"):
        topics.append("role.pep")
    if record.get("adverse_media"):
        topics.append("adverse_media")
    return topics


def _datasets(record: dict) -> list[str]:
    # Try sources[].name, then sanctions[].authority / source, then datasets[]
    sources = record.get("sources")
    if isinstance(sources, list):
        names = [
            str(s.get("name"))
            for s in sources
            if isinstance(s, dict) and s.get("name")
        ]
        if names:
            return names

    sanctions = record.get("sanctions")
    if isinstance(sanctions, list):
        names = [
            str(s.get("authority") or s.get("source"))
            for s in sanctions
            if isinstance(s, dict) and (s.get("authority") or s.get("source"))
        ]
        if names:
            return names

    ds = record.get("datasets")
    if isinstance(ds, list):
        return [str(d) for d in ds]

    return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def screen_person(
    *,
    full_name: str,
    first_name: str | None = None,
    last_name: str | None = None,
    birth_year: int | None = None,
    birth_date: str | None = None,
    nationality: str | None = None,
) -> ScreeningOutcome:
    api_key = getattr(settings, "DILISENSE_API_KEY", "") or ""
    if not api_key:
        log.warning("DILISENSE_API_KEY not set; skipping Dilisense")
        return ScreeningOutcome(
            status="FLAGGED",
            matches=[],
            error="screening_not_configured",
        )

    base_url = (
        getattr(settings, "DILISENSE_BASE_URL", "https://api.dilisense.com")
        or "https://api.dilisense.com"
    ).rstrip("/")
    threshold = getattr(settings, "DILISENSE_THRESHOLD", _DEFAULT_THRESHOLD)

    query_name = full_name or " ".join(
        p for p in (first_name, last_name) if p
    ).strip()
    if not query_name:
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error="no_name_supplied",
        )

    params: dict[str, str | float] = {
        "names": query_name,
        "threshold": threshold,
    }
    if birth_date:
        params["birthdate"] = birth_date
    elif birth_year:
        params["birthdate"] = f"{birth_year}-01-01"
    if nationality:
        params["nationality"] = nationality

    url = f"{base_url}/v1/checkIndividual"

    log.info("Dilisense checkIndividual -> %s (name=%r)", url, query_name)

    try:
        response = requests.get(
            url,
            params=params,
            headers={"x-api-key": api_key, "Accept": "application/json"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        log.warning("Dilisense request failed: %s", exc)
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error=f"transport: {exc}",
        )

    if response.status_code == 401:
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error="unauthorized",
        )
    if response.status_code == 403:
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error="forbidden",
        )
    if response.status_code != 200:
        preview = (response.text or "")[:200].replace("\n", " ")
        log.warning("Dilisense returned %s: %s", response.status_code, preview)
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error=f"HTTP {response.status_code}",
        )

    try:
        body = response.json()
    except ValueError as exc:
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error=f"response not JSON: {exc}",
        )

    raw_records = body.get("found_records") or []
    if not isinstance(raw_records, list):
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error="found_records not a list",
            raw_response=body,
        )

    matches: list[SanctionsMatch] = []
    for record in raw_records:
        if not isinstance(record, dict):
            continue
        matches.append(
            SanctionsMatch(
                entity_id=_entity_id(record),
                caption=_caption(record),
                score=_score(record),
                schema=_schema(record),
                topics=_topics(record),
                datasets=_datasets(record),
                raw=record,
            )
        )

    matches.sort(key=lambda m: m.score, reverse=True)

    if not matches:
        status = "CLEAR"
    elif any(m.score >= _MATCH_BAND for m in matches):
        status = "MATCH"
    else:
        status = "FLAGGED"

    return ScreeningOutcome(
        status=status,
        matches=matches,
        parsed_query={"endpoint": "/v1/checkIndividual", "params": params},
        raw_response=body,
    )