# backend/screening/opensanctions_client.py
"""
OpenSanctions /match client.

Synchronous screening against the OpenSanctions database — sanctions,
PEPs, RCAs, and related risk topics. One HTTP call, structured
response, no webhook.

Licensing note: OpenSanctions is CC-BY-NC 4.0 for non-commercial use.
Commercial use requires a paid data license. Do not deploy to
production without one.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import requests
from django.conf import settings

log = logging.getLogger(__name__)

# Topics we care about for KYC. Filtering here narrows the candidate
# pool at the search stage and improves precision. Anything outside
# these is noise for a bank's onboarding flow.
SCREENING_TOPICS = [
    "sanction",
    "sanction.linked",
    "role.pep",
    "role.rca",
]

_TIMEOUT = (10, 30)  # (connect, read) — OpenSanctions is fast but be polite


@dataclass
class SanctionsMatch:
    entity_id: str
    caption: str
    score: float
    schema: str
    topics: list[str] = field(default_factory=list)
    datasets: list[str] = field(default_factory=list)
    raw: dict = field(default_factory=dict)


@dataclass
class ScreeningOutcome:
    status: str                       # "CLEAR" | "FLAGGED" | "MATCH"
    matches: list[SanctionsMatch]
    parsed_query: dict | None = None  # OpenSanctions' interpretation of our input
    raw_response: dict | None = None
    error: str | None = None


def screen_person(
    *,
    full_name: str,
    first_name: str | None = None,
    last_name: str | None = None,
    birth_year: int | None = None,
    birth_date: str | None = None,      # ISO YYYY-MM-DD
    nationality: str | None = None,
) -> ScreeningOutcome:
    """
    Screen a single person against OpenSanctions.

    Returns an outcome with `status` derived from the highest-scoring
    result:
      - no matches above threshold    -> CLEAR
      - any match between floor and match_threshold -> FLAGGED
      - any match at or above match_threshold -> MATCH

    The distinction matters: MATCH is a hard fail (sanctioned entity),
    FLAGGED is a soft signal requiring officer review (common name,
    partial match).
    """
    api_key = settings.OPENSANCTIONS_API_KEY
    if not api_key:
        log.warning("OPENSANCTIONS_API_KEY not set; skipping screening")
        return ScreeningOutcome(
            status="FLAGGED",
            matches=[],
            error="screening_not_configured",
        )

    # Build the FtM query. Prefer the specific name fields when we
    # have them — OpenSanctions matches more precisely on
    # firstName/lastName than on a single `name` string.
    properties: dict[str, list[str]] = {}

    if first_name and last_name:
        properties["firstName"] = [first_name]
        properties["lastName"] = [last_name]
        # Also pass the combined name so the algorithm can use it as
        # an additional signal. The docs explicitly say the API may
        # add an alias entry from the split fields anyway.
        properties["name"] = [full_name]
    else:
        # Only a full name available — pass it as `name`. OpenSanctions
        # will tokenize internally.
        properties["name"] = [full_name]

    if birth_date:
        properties["birthDate"] = [birth_date]
    elif birth_year:
        # Year-only is accepted and still useful — the algorithm
        # penalises mismatches.
        properties["birthDate"] = [str(birth_year)]

    if nationality:
        properties["nationality"] = [nationality]

    query = {
        "schema": "Person",
        "properties": properties,
    }

    params = {
        "topics": SCREENING_TOPICS,
        "algorithm": "logic-v2",     # pin — don't let a silent default change drift scores
        "threshold": settings.OPENSANCTIONS_THRESHOLD,
        "limit": 10,
    }

    url = (
        f"{settings.OPENSANCTIONS_BASE_URL}/match/"
        f"{settings.OPENSANCTIONS_DATASET}"
    )

    try:
        response = requests.post(
            url,
            json={"queries": {"q": query}},
            params=params,
            headers={
                "Authorization": f"ApiKey {api_key}",
                "Accept": "application/json",
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        log.warning("OpenSanctions request failed: %s", exc)
        return ScreeningOutcome(
            status="FLAGGED",
            matches=[],
            error=f"transport: {exc}",
        )

    if response.status_code == 401:
        log.error("OpenSanctions rejected the API key")
        return ScreeningOutcome(
            status="FLAGGED", matches=[], error="unauthorized",
        )

    if response.status_code != 200:
        preview = (response.text or "")[:200].replace("\n", " ")
        log.warning(
            "OpenSanctions returned %s: %s", response.status_code, preview,
        )
        return ScreeningOutcome(
            status="FLAGGED",
            matches=[],
            error=f"HTTP {response.status_code}",
        )

    body = response.json()
    query_block = (body.get("responses") or {}).get("q") or {}
    results = query_block.get("results") or []
    parsed_query = query_block.get("query") or None

    matches: list[SanctionsMatch] = []
    for result in results:
        if not result.get("match"):
            # Below the threshold — OpenSanctions returns the
            # candidate anyway but marks it not-a-match. Skip.
            continue

        props = result.get("properties") or {}
        matches.append(
            SanctionsMatch(
                entity_id=result.get("id", ""),
                caption=result.get("caption", ""),
                score=float(result.get("score", 0.0)),
                schema=result.get("schema", ""),
                topics=list(props.get("topics") or []),
                datasets=list(result.get("datasets") or []),
                raw=result,
            )
        )

    matches.sort(key=lambda m: m.score, reverse=True)

    if not matches:
        status = "CLEAR"
    elif any(m.score >= 0.95 for m in matches):
        # Very high confidence — this is the "likely true positive" band
        status = "MATCH"
    else:
        # Above threshold but not certain — needs officer eyes
        status = "FLAGGED"

    return ScreeningOutcome(
        status=status,
        matches=matches,
        parsed_query=parsed_query,
        raw_response=body,
    )