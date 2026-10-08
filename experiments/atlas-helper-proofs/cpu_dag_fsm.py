"""Immutable PLAN state transition and checksum receipts; no cross-turn persistence."""
from dataclasses import dataclass
from hashlib import sha256
import json

@dataclass(frozen=True)
class Plan:
    request_id: str
    execution_id: str
    plan_revision: str
    actions: tuple[str, ...]
    allowed_actions: tuple[str, ...]

def validate(plan: Plan) -> dict:
    if any(not x for x in (plan.request_id, plan.execution_id, plan.plan_revision)):
        raise ValueError("MISSING_IDENTITY")
    if not plan.actions or len(set(plan.actions)) != len(plan.actions):
        raise ValueError("DUPLICATE_OR_EMPTY_ACTIONS")
    if len(plan.actions) > 256 or any(a not in plan.allowed_actions for a in plan.actions):
        raise ValueError("ACTION_NOT_ALLOWED")
    raw = json.dumps({"request_id":plan.request_id, "execution_id":plan.execution_id,
                      "plan_revision":plan.plan_revision, "actions":plan.actions,
                      "allowed_actions":plan.allowed_actions},
                     sort_keys=True, separators=(",",":")).encode()
    return {"transition": "PLAN->PLAN_VALIDATED", "status": "PROPOSAL_ONLY",
            "checksum": "sha256:" + sha256(raw).hexdigest(), "writes_performed": False}
