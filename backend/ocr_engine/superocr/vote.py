from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import mean
from typing import Callable, Mapping

from .types import Reading


@dataclass(frozen=True)
class VoteOutcome:
    value: str | None
    agreement: float
    confidence: float
    votes: int          # readings that produced the winner (one engine on 4 variants = 4 votes)
    conflict: bool
    engines: int = 0    # distinct engines among those readings; the independent-evidence count


def vote(readings: list[Reading], normalize: Callable[[str], str | None],
         weights: Mapping[str, float]) -> VoteOutcome:
    """
    Group readings by canonical value; invalid readings vote for nothing but
    still count in the denominator, so noisy fields score low agreement.
    `conflict` = a different valid value has at least half the winner's weight.

    `votes` counts readings, but readings from one engine over several
    preprocessing variants of the same pixels are correlated. `engines` counts
    distinct engines behind the winner so callers can require real independence.
    """
    total = sum(weights.get(r.engine, 1.0) for r in readings)
    tally: dict[str, list] = defaultdict(lambda: [0.0, [], set()])
    for r in readings:
        v = normalize(r.text) if r.text else None
        if v is None:
            continue
        tally[v][0] += weights.get(r.engine, 1.0)
        tally[v][1].append(r.conf)
        tally[v][2].add(r.engine)
    if not tally or total == 0:
        return VoteOutcome(None, 0.0, 0.0, 0, False, 0)

    ranked = sorted(tally.items(), key=lambda kv: (kv[1][0], mean(kv[1][1])), reverse=True)
    best, (bw, confs, engs) = ranked[0]
    agreement = bw / total
    conflict = len(ranked) > 1 and ranked[1][1][0] >= 0.5 * bw
    return VoteOutcome(best, agreement, mean(confs) * agreement, len(confs), conflict, len(engs))