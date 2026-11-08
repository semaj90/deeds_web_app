"""Parent Atlas: fail-closed OaK -> DSPy -> offline GEPA *shadow* handoff.

This is a small adapter, not a new ontology/packet/judge owner. It imports the
existing Pydantic OaK contracts and DSPy repair functions lazily, permitting
contract-only tests without installing DSPy, GEPA or GPU packages.

The caller MUST supply an authorized ContextManifest checksum and its exact
allowed evidence refs / target IDs; this module cannot independently grant
source access, authenticate a user or certify external validator receipts.
"""
from __future__ import annotations

from hashlib import sha256
from importlib import import_module
import json
import re
from typing import Any, Callable, Mapping, Sequence

_SHA = re.compile(r"sha256:[0-9a-f]{64}\Z")
_HANDOFF_SCHEMA = "atlas.oak-dspy-gepa-shadow-handoff.v1"
_PROPOSAL_SCHEMA = "atlas.oak-dspy-gepa-shadow-proposal.v1"


def _oak():
    return import_module("python.oak_agent.structured_contracts_v1")


def _repair():
    return import_module("python.parent_atlas_dspy_repair")


def _bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")


def _digest(value: Any) -> str:
    return "sha256:" + sha256(_bytes(value)).hexdigest()


def _sha(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _SHA.fullmatch(value):
        raise ValueError(f"{label}: REQUIRE_SHA256_DIGEST")
    return value


def _nonempty(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}: REQUIRED_STRING")
    return value.strip()


def _ids(values: Sequence[str], label: str, *, limit: int = 512) -> list[str]:
    if isinstance(values, (str, bytes)) or not isinstance(values, Sequence):
        raise ValueError(f"{label}: REQUIRE_SEQUENCE")
    ids = [_nonempty(v, label) for v in values]
    if not ids or len(ids) > limit or len(ids) != len(set(ids)):
        raise ValueError(f"{label}: EMPTY_DUPLICATE_OR_OVER_LIMIT")
    return ids


def _strict_keys(value: Any, allowed: set[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != allowed:
        raise ValueError(f"{label}: UNRECOGNIZED_OR_MISSING_FIELDS")
    return value


def prepare_oak_repair_handoff_v1(
    *,
    oak_args: Any,
    oak_result: Any,
    context_manifest_checksum: str,
    allowed_evidence_refs: Sequence[str],
    allowed_target_ids: Sequence[str],
    query: str,
) -> dict[str, Any]:
    """Bind a checksummed OaK result to an *upstream-admitted* ContextManifest.

    Rejects result tampering, stale request/policy/ontology revisions, unknown
    facts, source refs outside the manifest, unbounded hops and empty grounding.
    No network, database, cache, inference or filesystem I/O.
    """
    mod = _oak()
    args = mod.FindFailureContextArgsV1.model_validate(oak_args)
    result = mod.FailureContextResultV1.model_validate(oak_result)
    if result.status != "AVAILABLE" or not result.evidence:
        raise ValueError("OAK_GROUNDING_UNAVAILABLE")
    if result.requestId != args.requestId:
        raise ValueError("OAK_REQUEST_ID_MISMATCH")
    if result.ontologyRevision != args.ontologyRevision or result.policyRevision != args.policyRevision:
        raise ValueError("OAK_ONTOLOGY_OR_POLICY_REVISION_MISMATCH")
    if len(result.evidence) > args.maxNeighbors:
        raise ValueError("OAK_FANOUT_LIMIT_EXCEEDED")
    expected = mod.build_failure_context_result_v1(
        request_id=result.requestId,
        status=result.status,
        evidence=tuple(result.evidence),
        ontology_revision=result.ontologyRevision,
        policy_revision=result.policyRevision,
        producer_revision=result.producerRevision,
    )
    if expected.resultChecksum != result.resultChecksum:
        raise ValueError("OAK_RESULT_CHECKSUM_MISMATCH")
    admitted = dict(zip(args.admittedFactIds, args.admittedFactChecksums, strict=True))
    refs = set(_ids(allowed_evidence_refs, "allowed_evidence_refs"))
    targets = _ids(allowed_target_ids, "allowed_target_ids")
    seen: set[tuple[str, str, str]] = set()
    for item in result.evidence:
        if admitted.get(item.factId) != item.factChecksum:
            raise ValueError("OAK_UNADMITTED_FACT_OR_CHECKSUM")
        if item.evidenceRef not in refs:
            raise ValueError("OAK_UNAUTHORIZED_EVIDENCE_REF")
        if item.distance > args.maxHops:
            raise ValueError("OAK_HOP_LIMIT_EXCEEDED")
        key = (item.factId, item.relation, item.evidenceRef)
        if key in seen:
            raise ValueError("OAK_DUPLICATE_EVIDENCE")
        seen.add(key)

    evidence_refs = sorted({item.evidenceRef for item in result.evidence})
    diagnosis_context = _bytes({
        "schema": "atlas.oak-grounding-context.v1",
        "requestId": args.requestId,
        "workspaceRevision": args.workspaceRevision,
        "ontologyRevision": args.ontologyRevision,
        "policyRevision": args.policyRevision,
        "taskProfileChecksum": args.taskProfileChecksum,
        "oakResultChecksum": result.resultChecksum,
        "facts": [item.model_dump(mode="json") for item in result.evidence],
    }).decode("utf-8")
    request = _repair().validate_dspy_repair_request_v1({
        "schema": "atlas.dspy-repair-request.v1",
        "contextManifestChecksum": _sha(context_manifest_checksum, "context_manifest_checksum"),
        "query": _nonempty(query, "query"),
        "diagnosisContext": diagnosis_context,
        "allowedTargetCandidateIds": targets,
        "allowedEvidenceRefs": evidence_refs,
        "authority": "PROPOSAL_ONLY",
    })
    body = {
        "schema": _HANDOFF_SCHEMA,
        "requestId": args.requestId,
        "workspaceRevision": args.workspaceRevision,
        "ontologyRevision": args.ontologyRevision,
        "policyRevision": args.policyRevision,
        "oakResultChecksum": result.resultChecksum,
        "contextManifestChecksum": context_manifest_checksum,
        "request": request,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {**body, "handoffChecksum": _digest(body)}


def verify_oak_repair_handoff_v1(handoff: Any) -> dict[str, Any]:
    required = {"schema", "requestId", "workspaceRevision", "ontologyRevision",
                "policyRevision", "oakResultChecksum", "contextManifestChecksum", "request",
                "canonicalAuthority", "writesPerformed", "handoffChecksum"}
    doc = _strict_keys(handoff, required, "OAK_HANDOFF")
    if doc["schema"] != _HANDOFF_SCHEMA or doc["canonicalAuthority"] is not False or doc["writesPerformed"] is not False:
        raise ValueError("OAK_HANDOFF_AUTHORITY_VIOLATION")
    for k in ("requestId", "workspaceRevision", "ontologyRevision", "policyRevision"):
        _nonempty(doc[k], k)
    for k in ("oakResultChecksum", "contextManifestChecksum", "handoffChecksum"):
        _sha(doc[k], k)
    if _digest({k: v for k, v in doc.items() if k != "handoffChecksum"}) != doc["handoffChecksum"]:
        raise ValueError("OAK_HANDOFF_CHECKSUM_MISMATCH")
    request = _repair().validate_dspy_repair_request_v1(doc["request"])
    if request["contextManifestChecksum"] != doc["contextManifestChecksum"]:
        raise ValueError("OAK_HANDOFF_MANIFEST_MISMATCH")
    grounding = json.loads(request["diagnosisContext"])
    if (grounding.get("requestId") != doc["requestId"] or
        grounding.get("workspaceRevision") != doc["workspaceRevision"] or
        grounding.get("ontologyRevision") != doc["ontologyRevision"] or
        grounding.get("policyRevision") != doc["policyRevision"] or
        grounding.get("oakResultChecksum") != doc["oakResultChecksum"]):
        raise ValueError("OAK_HANDOFF_GROUNDING_MISMATCH")
    if sorted(set(request["allowedEvidenceRefs"])) != sorted({fact["evidenceRef"] for fact in grounding["facts"]}):
        raise ValueError("OAK_HANDOFF_EVIDENCE_MISMATCH")
    return dict(doc)


def run_shadow_repair_proposal_v1(handoff: Mapping[str, Any], program: Any, *, program_revision: str) -> dict[str, Any]:
    """Invoke the existing DSPy worker adapter. `program` must be a trusted proposal-only executor.

    This function itself performs no writes; it does not attest that an arbitrary
    externally provided callable was side-effect-free.
    """
    bound = verify_oak_repair_handoff_v1(handoff)
    proposal = _repair().run_repair_request_v1(bound["request"], program)
    proposal = _repair().validate_dspy_repair_output_v1(
        proposal,
        context_manifest_checksum=bound["contextManifestChecksum"],
        allowed_evidence_refs=bound["request"]["allowedEvidenceRefs"],
        allowed_target_ids=bound["request"]["allowedTargetCandidateIds"],
    )
    body = {
        "schema": _PROPOSAL_SCHEMA,
        "status": "SHADOW_PROPOSAL_ONLY",
        "requestId": bound["requestId"],
        "handoffChecksum": bound["handoffChecksum"],
        "contextManifestChecksum": bound["contextManifestChecksum"],
        "programRevision": _nonempty(program_revision, "program_revision"),
        "proposal": proposal,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "validatorStatus": "NOT_RUN",
        "optimizationStatus": "NOT_RUN",
    }
    return {**body, "proposalReceiptChecksum": _digest(body)}


def verify_shadow_repair_proposal_v1(value: Any, *, handoff: Mapping[str, Any]) -> dict[str, Any]:
    """Read back and revalidate a proposal-only receipt against its bound handoff."""
    expected = {"schema", "status", "requestId", "handoffChecksum",
                "contextManifestChecksum", "programRevision", "proposal",
                "canonicalAuthority", "writesPerformed", "validatorStatus",
                "optimizationStatus", "proposalReceiptChecksum"}
    doc = _strict_keys(value, expected, "OAK_PROPOSAL_RECEIPT")
    bound = verify_oak_repair_handoff_v1(handoff)
    if doc["schema"] != _PROPOSAL_SCHEMA or doc["status"] != "SHADOW_PROPOSAL_ONLY":
        raise ValueError("OAK_PROPOSAL_RECEIPT_STATUS_INVALID")
    if doc["canonicalAuthority"] is not False or doc["writesPerformed"] is not False:
        raise ValueError("OAK_PROPOSAL_RECEIPT_AUTHORITY_INVALID")
    if doc["validatorStatus"] != "NOT_RUN" or doc["optimizationStatus"] != "NOT_RUN":
        raise ValueError("OAK_PROPOSAL_RECEIPT_UNPROVEN_EXECUTION")
    if doc["requestId"] != bound["requestId"] or doc["handoffChecksum"] != bound["handoffChecksum"]:
        raise ValueError("OAK_PROPOSAL_RECEIPT_HANDOFF_MISMATCH")
    if doc["contextManifestChecksum"] != bound["contextManifestChecksum"]:
        raise ValueError("OAK_PROPOSAL_RECEIPT_MANIFEST_MISMATCH")
    _nonempty(doc["programRevision"], "programRevision")
    _sha(doc["proposalReceiptChecksum"], "proposalReceiptChecksum")
    if _digest({k: v for k, v in doc.items() if k != "proposalReceiptChecksum"}) != doc["proposalReceiptChecksum"]:
        raise ValueError("OAK_PROPOSAL_RECEIPT_CHECKSUM_MISMATCH")
    _repair().validate_dspy_repair_output_v1(
        doc["proposal"],
        context_manifest_checksum=bound["contextManifestChecksum"],
        allowed_evidence_refs=bound["request"]["allowedEvidenceRefs"],
        allowed_target_ids=bound["request"]["allowedTargetCandidateIds"],
    )
    return dict(doc)


def build_receipt_only_gepa_metric_v1(
    *,
    load_validator_receipt: Callable[[Mapping[str, Any], Mapping[str, Any]], Mapping[str, Any] | None],
    attest_validator_receipt: Callable[[Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]], bool],
) -> Callable[..., Any]:
    """Wrap existing GEPA metric; independent validator ownership stays external.

    The loader MUST retrieve immutable results from an independently trusted
    execution/validator store. A self-reported checksum is not proof. Missing,
    unverified or non-bound receipts abort the evaluation (not scored as success).
    This function neither invokes GEPA nor executes validation commands.
    """
    if not callable(load_validator_receipt) or not callable(attest_validator_receipt):
        raise ValueError("GEPA_TRUSTED_VALIDATOR_CALLBACK_REQUIRED")
    repair = _repair()
    def receipt_evaluator(gold: Mapping[str, Any], proposal: Mapping[str, Any]) -> Mapping[str, Any]:
        checksum = gold.get("context_manifest_checksum") or gold.get("contextManifestChecksum")
        if proposal["contextManifestChecksum"] != checksum:
            raise ValueError("GEPA_MANIFEST_MISMATCH")
        receipt = load_validator_receipt(gold, proposal)
        if receipt is None or not isinstance(receipt, Mapping):
            raise ValueError("GEPA_INDEPENDENT_VALIDATOR_RECEIPT_MISSING")
        if not attest_validator_receipt(gold, proposal, receipt):
            raise ValueError("GEPA_UNTRUSTED_OR_UNBOUND_VALIDATOR_RECEIPT")
        # The existing scorer checks required metric fields, finite bounds and
        # hard failures; never derive validation results from model-generated text.
        repair.build_repair_metric_observation_from_receipt_v1(receipt)
        return receipt
    return repair.build_gepa_repair_metric_v1(receipt_evaluator)


def check_frozen_gepa_splits_v1(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Validate frozen metadata only; no DSPy/GEPA/model invocation.

    Group by sourceRef across train/validation/heldout to prevent source leakage.
    The caller must obtain authentic source revisions and labels elsewhere.
    """
    expected = {"exampleId", "sourceRef", "sourceRevision", "workspaceRevision", "split"}
    ids: set[str] = set()
    split_of_source: dict[str, str] = {}
    workspace: str | None = None
    counts = {"train": 0, "validation": 0, "heldout": 0}
    clean: list[dict[str, str]] = []
    if not records:
        raise ValueError("GEPA_FROZEN_CORPUS_EMPTY")
    for rec in records:
        doc = _strict_keys(rec, expected, "GEPA_SPLIT_ROW")
        rid = _nonempty(doc["exampleId"], "exampleId")
        source = _nonempty(doc["sourceRef"], "sourceRef")
        source_rev = _sha(doc["sourceRevision"], "sourceRevision")
        work_rev = _nonempty(doc["workspaceRevision"], "workspaceRevision")
        split = doc["split"]
        if split not in counts or not isinstance(split, str):
            raise ValueError("GEPA_SPLIT_INVALID")
        if rid in ids:
            raise ValueError("GEPA_DUPLICATE_EXAMPLE")
        ids.add(rid)
        if workspace is not None and workspace != work_rev:
            raise ValueError("GEPA_MIXED_WORKSPACE_REVISIONS")
        workspace = work_rev
        if source in split_of_source and split_of_source[source] != split:
            raise ValueError("GEPA_SOURCE_LEAKAGE")
        split_of_source[source] = split
        counts[split] += 1
        clean.append({"exampleId": rid, "sourceRef": source, "sourceRevision": source_rev,
                      "workspaceRevision": work_rev, "split": split})
    if any(n == 0 for n in counts.values()):
        raise ValueError("GEPA_SPLIT_MISSING_PARTITION")
    return {
        "schema": "atlas.oak-gepa-corpus-split-proof.v1",
        "status": "METADATA_VALID_ONLY",
        "counts": counts,
        "cohortChecksum": _digest(sorted(clean, key=lambda row: row["exampleId"])),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
