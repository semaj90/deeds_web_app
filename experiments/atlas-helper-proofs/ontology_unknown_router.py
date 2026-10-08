"""CPU-only taxonomy fallback; no ontology IDs or canonical facts are minted."""
from dataclasses import dataclass
from typing import Mapping
from cpu_nlp_lut import classify

@dataclass(frozen=True)
class ClassificationProposal:
    status: str
    domain: str
    score: float
    candidates: tuple[str, ...]
    evidence_required: bool = True

def route_unknown(text: str, taxonomy: Mapping[str, tuple[str, ...]],
                  minimum: float = 0.12, margin: float = 0.04) -> ClassificationProposal:
    if not 0 <= minimum <= 1 or not 0 <= margin <= 1:
        raise ValueError("INVALID_THRESHOLDS")
    if not taxonomy:
        return ClassificationProposal("UNKNOWN", "UNKNOWN", 0.0, ())
    hints = {h.domain: h.score for h in classify(text)}
    ranking = sorted(((name, hints.get(name, 0.0)) for name in taxonomy), key=lambda x: (-x[1], x[0]))
    winner, score = ranking[0]
    runner_up = ranking[1][1] if len(ranking) > 1 else 0.0
    if score < minimum or score - runner_up < margin:
        return ClassificationProposal("UNRESOLVED", "UNKNOWN", score, tuple(n for n,_ in ranking[:3]))
    return ClassificationProposal("PROPOSAL_ONLY", winner, score, tuple(n for n,_ in ranking[:3]))

def oak_tuple_candidates(proposal: ClassificationProposal, allowed_concepts: Mapping[str, tuple[str, ...]]):
    """Candidates only: a real oaklib mapping/resolution call is a separate owner gate."""
    if proposal.status != "PROPOSAL_ONLY":
        return ()
    return tuple((proposal.domain, concept) for concept in allowed_concepts.get(proposal.domain, ()))
