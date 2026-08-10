from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True)
class LodCandidate:
    key: str
    relevance: float
    authority: float
    execution_utility: float
    predicted_reuse: float
    bytes: int
    transfer_cost: float
    resident: bool
    pinned: bool = False


def utility(x: LodCandidate) -> float:
    byte_mib = x.bytes / (1024 * 1024)
    return (x.relevance + 0.2*x.authority + 0.4*x.execution_utility + 0.5*x.predicted_reuse
            - 0.03*byte_mib - 0.15*x.transfer_cost)


def choose(candidates: list[LodCandidate], max_resident: int) -> tuple[list[str], list[str]]:
    ranked = sorted(candidates, key=lambda x: (-utility(x), x.key))
    keep = [x.key for x in ranked[:max_resident]]
    demote = [x.key for x in candidates if x.resident and x.key not in keep and not x.pinned]
    return keep, sorted(demote)
