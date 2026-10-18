# backend/screening/aggregator.py
"""
Aggregate screening: run every configured provider, merge results.

Status precedence (safe direction):

    MATCH  > FLAGGED > CLEAR

If *any* provider says MATCH, the aggregate is MATCH. If the best any
provider says is FLAGGED, the aggregate is FLAGGED. Only if every
provider says CLEAR is the aggregate CLEAR.

A provider whose key is missing returns `error="screening_not_configured"`
and is skipped entirely — it does not downgrade the aggregate to FLAGGED,
and it does not inflate the count of providers that ran.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from . import dilisense_client, opensanctions_client

log = logging.getLogger(__name__)

_RANK = {"CLEAR": 0, "FLAGGED": 1, "MATCH": 2}
_STATUS_BY_RANK = {0: "CLEAR", 1: "FLAGGED", 2: "MATCH"}

_SKIP_ERRORS = {"screening_not_configured", "no_name_supplied"}

# Cap on stored raw response size. Providers return a list of candidates
# even when none pass the threshold; on a common name that list can be
# long. We keep the first N records verbatim and note the truncation,
# so the officer sees the real shape without us storing megabytes per
# workflow.
_MAX_RAW_RECORDS = 20


@dataclass
class AggregatedOutcome:
    status: str
    matches: list
    providers: list[str]
    per_provider: dict[str, dict] = field(default_factory=dict)
    error: str | None = None


def _is_skipped(outcome) -> bool:
    return outcome.error in _SKIP_ERRORS


def _tag(match, provider: str):
    """Attach the source provider to the raw record for the officer view."""
    raw = dict(match.raw or {})
    raw["_provider"] = provider
    match.raw = raw
    return match


def _run_provider(name: str, client, kwargs: dict):
    """Run one provider, catching every exception so it can never crash the task."""
    try:
        return client.screen_person(**kwargs)
    except Exception as exc:
        log.exception("%s raised", name)
        return client.ScreeningOutcome(
            status="FLAGGED",
            matches=[],
            error=f"exception: {exc}",
        )


def _truncate_response(body):
    """
    Return `body` with `found_records` / `results` truncated if very
    large. None stays None. Anything else passes through untouched.
    """
    if not isinstance(body, dict):
        return body

    # Dilisense shape
    records = body.get("found_records")
    if isinstance(records, list) and len(records) > _MAX_RAW_RECORDS:
        trimmed = dict(body)
        trimmed["found_records"] = records[:_MAX_RAW_RECORDS]
        trimmed["_truncated"] = {
            "total": len(records),
            "kept": _MAX_RAW_RECORDS,
        }
        return trimmed

    # OpenSanctions shape — response is wrapped in `responses.q.results`
    responses = body.get("responses")
    if isinstance(responses, dict):
        q = responses.get("q")
        if isinstance(q, dict):
            results = q.get("results")
            if isinstance(results, list) and len(results) > _MAX_RAW_RECORDS:
                trimmed = dict(body)
                trimmed_responses = dict(responses)
                trimmed_q = dict(q)
                trimmed_q["results"] = results[:_MAX_RAW_RECORDS]
                trimmed_responses["q"] = trimmed_q
                trimmed["responses"] = trimmed_responses
                trimmed["_truncated"] = {
                    "total": len(results),
                    "kept": _MAX_RAW_RECORDS,
                }
                return trimmed

    return body


def screen_person(
    *,
    full_name: str,
    first_name: str | None = None,
    last_name: str | None = None,
    birth_year: int | None = None,
    birth_date: str | None = None,
    nationality: str | None = None,
) -> AggregatedOutcome:
    kwargs = dict(
        full_name=full_name,
        first_name=first_name,
        last_name=last_name,
        birth_year=birth_year,
        birth_date=birth_date,
        nationality=nationality,
    )

    outcomes: dict[str, object] = {}
    providers_that_ran: list[str] = []

    # --- OpenSanctions ----------------------------------------------------
    os_outcome = _run_provider("OpenSanctions", opensanctions_client, kwargs)
    if _is_skipped(os_outcome):
        log.info("OpenSanctions skipped (%s)", os_outcome.error)
    else:
        providers_that_ran.append("opensanctions")
        outcomes["opensanctions"] = os_outcome

    # --- Dilisense --------------------------------------------------------
    ds_outcome = _run_provider("Dilisense", dilisense_client, kwargs)
    if _is_skipped(ds_outcome):
        log.info("Dilisense skipped (%s)", ds_outcome.error)
    else:
        providers_that_ran.append("dilisense")
        outcomes["dilisense"] = ds_outcome

    # --- Nothing ran ------------------------------------------------------
    if not providers_that_ran:
        return AggregatedOutcome(
            status="FLAGGED",
            matches=[],
            providers=[],
            error="no_screening_provider_configured",
        )

    # --- Merge ------------------------------------------------------------
    merged_matches = []
    per_provider: dict[str, dict] = {}
    worst_rank = 0
    first_error: str | None = None

    for provider, outcome in outcomes.items():
        per_provider[provider] = {
            "status": outcome.status,
            "match_count": len(outcome.matches),
            "error": outcome.error,
            "parsed_query": outcome.parsed_query,
            # Full provider-native JSON body. Stored so the officer can
            # verify what the provider actually returned — not just
            # what our client extracted from it. Bounded above to avoid
            # unbounded DB growth.
            "raw_response": _truncate_response(outcome.raw_response),
        }
        for m in outcome.matches:
            merged_matches.append(_tag(m, provider))
        rank = _RANK.get(outcome.status, 1)
        if rank > worst_rank:
            worst_rank = rank
        if outcome.error and not first_error:
            first_error = f"{provider}: {outcome.error}"

    merged_matches.sort(key=lambda m: m.score, reverse=True)

    return AggregatedOutcome(
        status=_STATUS_BY_RANK[worst_rank],
        matches=merged_matches,
        providers=providers_that_ran,
        per_provider=per_provider,
        error=first_error,
    )