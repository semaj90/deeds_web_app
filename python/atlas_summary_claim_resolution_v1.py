"""VAL-09: deterministic escalation/resolution for ONE claim's validator slots -> ADMIT | REVIEW | REJECT (+ the resolution layer that decided).

Pure function of the VAL-01 slots: no model call, no I/O, no store. Precedence is fixed and ordered, so a lower (deterministic) layer always wins:
  1 technical FAIL -> REJECT       2 numeric FAIL -> REJECT        3 version FAIL -> REJECT
  4 sourceSpan REJECTED/UNVERIFIED -> REJECT                        5 ontology FAIL -> REJECT
  6 semantic UNSUPPORTED_CLAIM / CONTRADICTED -> REJECT
  7 an incomplete deterministic layer (technical/numeric/version/sourceSpan NOT_RUN, span CLAIMED but unverified) -> REVIEW
  8 semantic not decisive (NOT_RUN, JUDGE_ERROR, UNKNOWN, INSUFFICIENT_EVIDENCE, PARTIALLY_SUPPORTED) -> REVIEW
  9 semantic SUPPORTED / SUPPORTED_PARAPHRASE / SUPPORTED_WITH_OMISSION -> ADMIT
The semantic judge (same model, weak signal) can never turn a deterministic failure into ADMIT; omission never gates a claim. An ontology slot that
is NOT_RUN or NOT_APPLICABLE is non-blocking (VAL-08 only applies to typed assertions). The result is re-sealed and re-validated with the strict mirror.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from atlas_summary_claim_validation_v1 import SummaryClaimValidation, seal_v1

ESCALATION_REVISION = "summary-claim-resolution:val-09-v1"
DECISIVE_SUPPORT = {"SUPPORTED", "SUPPORTED_PARAPHRASE", "SUPPORTED_WITH_OMISSION"}
DECISIVE_REJECT = {"UNSUPPORTED_CLAIM", "CONTRADICTED"}


def resolve_slots_v1(claim: dict[str, Any]) -> dict[str, Any]:
    """Returns {decision, resolutionLayer, reasons[]} from the slots of a validation dict (any seal fields ignored)."""
    tech, num, ver = claim["technical"]["status"], claim["numeric"]["status"], claim["version"]["status"]
    span, ont, sem = claim["sourceSpan"]["status"], claim["ontology"]["status"], claim["semantic"]
    if tech == "FAIL":
        return {"decision": "REJECT", "resolutionLayer": "TECHNICAL", "reasons": ["TECHNICAL_TOKEN_FAIL"]}
    if num == "FAIL":
        return {"decision": "REJECT", "resolutionLayer": "NUMERIC", "reasons": ["UNSUPPORTED_NUMBER"]}
    if ver == "FAIL":
        return {"decision": "REJECT", "resolutionLayer": "VERSION", "reasons": ["UNSUPPORTED_VERSION"]}
    if span in ("REJECTED", "UNVERIFIED"):
        return {"decision": "REJECT", "resolutionLayer": "SOURCE_SPAN", "reasons": ["INVALID_OR_FABRICATED_SPAN"]}
    if ont == "FAIL":
        return {"decision": "REJECT", "resolutionLayer": "ONTOLOGY", "reasons": ["ONTOLOGY_ASSERTION_FAIL"]}
    if sem["status"] == "JUDGED" and sem["verdict"] in DECISIVE_REJECT:
        return {"decision": "REJECT", "resolutionLayer": "SEMANTIC", "reasons": [f"SEMANTIC_{sem['verdict']}"]}
    incomplete = [name for name, status in (("TECHNICAL", tech), ("NUMERIC", num), ("VERSION", ver), ("SOURCE_SPAN", span)) if status == "NOT_RUN"]
    if span == "CLAIMED":
        incomplete.append("SOURCE_SPAN")
    if incomplete:
        return {"decision": "REVIEW", "resolutionLayer": incomplete[0], "reasons": [f"DETERMINISTIC_LAYER_INCOMPLETE:{','.join(dict.fromkeys(incomplete))}"]}
    if sem["status"] != "JUDGED" or sem["verdict"] not in DECISIVE_SUPPORT:
        why = sem["verdict"] if sem["status"] == "JUDGED" else sem["status"]
        return {"decision": "REVIEW", "resolutionLayer": "SEMANTIC", "reasons": [f"SEMANTIC_NOT_DECISIVE:{why}"]}
    return {"decision": "ADMIT", "resolutionLayer": "COMPOSITE", "reasons": [f"SEMANTIC_{sem['verdict']}", "DETERMINISTIC_LAYERS_CLEAN"]}


def resolve_and_seal_v1(claim: dict[str, Any]) -> dict[str, Any]:
    """Applies the decision to a validation dict, re-seals it (claimChecksum/validationId/validationChecksum) and re-validates with the strict mirror."""
    outcome = resolve_slots_v1(claim)
    body = {k: v for k, v in claim.items() if k not in ("validationId", "validationChecksum", "claimChecksum")}
    body["result"] = {"decision": outcome["decision"], "escalationRevision": ESCALATION_REVISION}
    body["resolutionLayer"] = outcome["resolutionLayer"]
    sealed = {**body, **seal_v1(body)}
    SummaryClaimValidation.model_validate(sealed)  # fail closed if the resolved object is not a valid sealed contract
    return sealed


def layer_telemetry_v1(resolved: list[dict[str, Any]]) -> dict[str, Any]:
    """Which layer resolved how many claims (learning data: how much needed the semantic judge vs deterministic layers)."""
    return {"claims": len(resolved), "byDecision": dict(Counter(c["result"]["decision"] for c in resolved)), "byLayer": dict(Counter(c["resolutionLayer"] for c in resolved))}
