"""Pure Python proposal gate; TypeScript/PostgreSQL remains completion authority."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping

FIELDS = ("run_id","step_id","attempt_id","dag_revision","source_revision",
          "workspace_revision","graph_revision","representation_revision",
          "model_revision","feature_revision","lease_id","generation",
          "evidence_digest","result_digest")
@dataclass(frozen=True)
class PromotionProposal:
    binding: tuple[tuple[str,str],...]
    cache_hit: bool
    status: str = "PROPOSED"

def prepare_proposal(candidate: Mapping[str,object], current: Mapping[str,object], *,
                     cache_hit: bool=False) -> PromotionProposal:
    for name in FIELDS:
        value=candidate.get(name)
        if value is None or str(value).strip()=="":
            raise ValueError("PROMOTION_FIELD_MISSING:"+name)
        if str(value) != str(current.get(name)):
            raise ValueError("PROMOTION_STALE:"+name)
    try:
        if int(candidate["generation"]) < 1: raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("PROMOTION_GENERATION_INVALID")
    if candidate.get("worker_status") != "PROPOSED":
        raise ValueError("PROMOTION_NOT_PROPOSED")
    return PromotionProposal(tuple((key,str(candidate[key])) for key in FIELDS),cache_hit)
