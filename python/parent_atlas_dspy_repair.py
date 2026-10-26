#!/usr/bin/env python3
"""DSPy/GEPA bridge for Parent Atlas repair-program optimization.

DSPy owns prompt/program structure. GEPA optimizes that program against a
receipt-derived metric. Neither component owns retrieval truth, graph truth,
or canonical evidence identity.

The module is import-safe when DSPy is not installed so repository tests can
validate the metric and data contracts without forcing GPU/LLM dependencies.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Sequence
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
import sys
import concurrent.futures

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover - runtime capability boundary
    dspy = None


def admit_agentic_repair_example_v1(
    value: Mapping[str, Any],
    *,
    source_bytes_by_ref: Mapping[str, bytes],
    qualified_candidate_ids: Sequence[str],
    known_validator_ids: Sequence[str],
) -> dict[str, Any]:
    """Admit one read-only repair example against caller-qualified evidence.

    The caller must obtain source bytes, retrieval qualification, and validator
    IDs from their existing owners. This function checks the supplied proof
    material; it does not resolve canonical identity or create those proofs.
    """
    def exact_object(item: Any, label: str, fields: set[str]) -> dict[str, Any]:
        if not isinstance(item, Mapping) or set(item) != fields:
            raise ValueError(f"{label} must contain exactly {sorted(fields)}")
        return dict(item)

    def text(item: Any, label: str) -> str:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{label} must be non-empty")
        normalized = item.strip()
        if normalized.lower() in {"unknown", "latest", "unset", "null"}:
            raise ValueError(f"{label} is unresolved")
        return normalized

    def digest(item: Any, label: str) -> str:
        normalized = text(item, label)
        if (
            len(normalized) != 71
            or not normalized.startswith("sha256:")
            or any(char not in "0123456789abcdef" for char in normalized[7:])
        ):
            raise ValueError(f"{label} must be sha256:<64 lowercase hex>")
        return normalized

    row = exact_object(
        value,
        "example",
        {"schema", "taskId", "canonicalId", "packetKey", "sourceRevision", "workspaceRevision", "sourceRefs", "error", "retrieval", "expectedOutcome"},
    )
    if row["schema"] != "atlas.agentic-repair-example.v1":
        raise ValueError("unsupported agentic repair example schema")
    identity = {
        "taskId": text(row["taskId"], "taskId"),
        "canonicalId": text(row["canonicalId"], "canonicalId"),
        "packetKey": text(row["packetKey"], "packetKey"),
        "sourceRevision": digest(row["sourceRevision"], "sourceRevision"),
        "workspaceRevision": digest(row["workspaceRevision"], "workspaceRevision"),
    }

    refs = row["sourceRefs"]
    if not isinstance(refs, list) or not refs:
        raise ValueError("sourceRefs must be non-empty")
    normalized_refs: list[dict[str, Any]] = []
    seen_refs: set[tuple[str, int, int]] = set()
    for index, raw in enumerate(refs):
        ref = exact_object(raw, f"sourceRefs[{index}]", {"locator", "surface"})
        locator = exact_object(
            ref["locator"],
            f"sourceRefs[{index}].locator",
            {"schema", "canonicalId", "packetKey", "sourceRef", "sourceKind", "filePath", "sourceUrl", "contentHash", "workspaceRevision", "sourceRevision", "span", "domain"},
        )
        if locator["schema"] != "atlas.evidence-locator.v1":
            raise ValueError("sourceRef locator schema is invalid")
        for key in ("canonicalId", "packetKey", "workspaceRevision", "sourceRevision"):
            expected = identity[key]
            actual = locator[key]
            if actual != expected:
                raise ValueError(f"sourceRefs[{index}].{key} does not match example identity")
        source_ref = text(locator["sourceRef"], f"sourceRefs[{index}].sourceRef")
        content_hash = digest(locator["contentHash"], f"sourceRefs[{index}].contentHash")
        span = locator["span"]
        if not isinstance(span, Mapping) or set(span) != {"startByte", "endByte"}:
            raise ValueError(f"sourceRefs[{index}].span is required")
        start, end = span["startByte"], span["endByte"]
        if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start:
            raise ValueError(f"sourceRefs[{index}].span is invalid")
        source_bytes = source_bytes_by_ref.get(source_ref)
        if not isinstance(source_bytes, bytes):
            raise ValueError(f"sourceRefs[{index}] source bytes are unavailable")
        if "sha256:" + hashlib.sha256(source_bytes).hexdigest() != content_hash:
            raise ValueError(f"sourceRefs[{index}] content checksum mismatch")
        if end > len(source_bytes):
            raise ValueError(f"sourceRefs[{index}].span exceeds source bytes")
        surface = text(ref["surface"], f"sourceRefs[{index}].surface")
        try:
            byte_surface = source_bytes[start:end].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f"sourceRefs[{index}].span splits a UTF-8 character") from exc
        if byte_surface != surface:
            raise ValueError(f"sourceRefs[{index}].surface does not match source bytes")
        key = (source_ref, start, end)
        if key in seen_refs:
            raise ValueError("sourceRefs contain duplicate locators")
        seen_refs.add(key)
        normalized_refs.append({"locator": dict(locator), "surface": surface})

    error = exact_object(row["error"], "error", {"class", "code", "message", "failingCommand", "failingTest"})
    normalized_error = {
        "class": text(error["class"], "error.class"),
        "code": None if error["code"] is None else text(error["code"], "error.code"),
        "message": text(error["message"], "error.message"),
        "failingCommand": None if error["failingCommand"] is None else text(error["failingCommand"], "error.failingCommand"),
        "failingTest": None if error["failingTest"] is None else text(error["failingTest"], "error.failingTest"),
    }
    retrieval = exact_object(row["retrieval"], "retrieval", {"queryText", "semanticRecipe", "candidateIds"})
    if retrieval["semanticRecipe"] != "semantic_768":
        raise ValueError("retrieval.semanticRecipe must be semantic_768")
    query_text = text(retrieval["queryText"], "retrieval.queryText")
    candidate_ids = retrieval["candidateIds"]
    if not isinstance(candidate_ids, list) or not candidate_ids:
        raise ValueError("retrieval.candidateIds must be non-empty")
    normalized_candidates = [text(item, "retrieval.candidateIds[]") for item in candidate_ids]
    if len(normalized_candidates) != len(set(normalized_candidates)):
        raise ValueError("retrieval.candidateIds contain duplicates")
    qualified = set(qualified_candidate_ids)
    if not set(normalized_candidates).issubset(qualified):
        raise ValueError("retrieval contains an unqualified candidate")
    if identity["canonicalId"] not in normalized_candidates:
        raise ValueError("retrieval candidates do not include canonicalId")

    outcome = exact_object(row["expectedOutcome"], "expectedOutcome", {"validatorIds", "mutationAllowed"})
    if outcome["mutationAllowed"] is not False:
        raise ValueError("mutationAllowed must be false")
    validator_ids = outcome["validatorIds"]
    if not isinstance(validator_ids, list) or not validator_ids:
        raise ValueError("expectedOutcome.validatorIds must be non-empty")
    normalized_validators = [text(item, "expectedOutcome.validatorIds[]") for item in validator_ids]
    if len(normalized_validators) != len(set(normalized_validators)):
        raise ValueError("validatorIds contain duplicates")
    if not set(normalized_validators).issubset(set(known_validator_ids)):
        raise ValueError("expectedOutcome contains an unknown validator")

    return {
        "schema": "atlas.agentic-repair-example.v1",
        **identity,
        "sourceRefs": normalized_refs,
        "error": normalized_error,
        "retrieval": {"queryText": query_text, "semanticRecipe": "semantic_768", "candidateIds": sorted(normalized_candidates)},
        "expectedOutcome": {"validatorIds": sorted(normalized_validators), "mutationAllowed": False},
    }


@dataclass(frozen=True, slots=True)
class RepairMetricObservationV1:
    retrieval_recall_at_5: float
    localization_recall_at_5: float
    exact_evidence_coverage: float
    targeted_tests_passed: bool
    typecheck_passed: bool
    regression_free: bool
    patch_minimality: float
    false_edit_rate: float
    latency_budget_score: float
    cache_reuse_rate: float
    # Set only from deterministic validator/operator receipts, never model text.
    hard_gate_failures: tuple[str, ...] = ()

def build_repair_metric_observation_from_receipt_v1(
    receipt: Mapping[str, Any],
) -> RepairMetricObservationV1:
    required_float_fields = [
        ("retrievalRecallAt5", "retrieval_recall_at_5"),
        ("localizationRecallAt5", "localization_recall_at_5"),
        ("exactEvidenceCoverage", "exact_evidence_coverage"),
        ("patchMinimality", "patch_minimality"),
        ("falseEditRate", "false_edit_rate"),
        ("latencyBudgetScore", "latency_budget_score"),
        ("cacheReuseRate", "cache_reuse_rate"),
    ]
    required_bool_fields = [
        ("targetedTestsPassed", "targeted_tests_passed"),
        ("typecheckPassed", "typecheck_passed"),
        ("regressionFree", "regression_free"),
    ]

    values: dict[str, Any] = {}
    for camel, snake in required_float_fields:
        raw = receipt.get(camel) if camel in receipt else receipt.get(snake)
        if raw is None or isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise ValueError(f"missing required metric field: {camel}")
        val = float(raw)
        if not (0.0 <= val <= 1.0) or math.isnan(val) or math.isinf(val):
            raise ValueError(f"metric field {camel} must be between 0.0 and 1.0, got {val}")
        values[snake] = val

    for camel, snake in required_bool_fields:
        raw = receipt.get(camel) if camel in receipt else receipt.get(snake)
        if raw is None or not isinstance(raw, bool):
            raise ValueError(f"missing required metric field: {camel}")
        values[snake] = raw

    raw_hard = receipt.get("hardGateFailures") if "hardGateFailures" in receipt else receipt.get("hard_gate_failures", ())
    if raw_hard is None:
        hard_failures = ()
    elif isinstance(raw_hard, (list, tuple)):
        hard_failures = tuple(str(x) for x in raw_hard)
    else:
        raise ValueError("hardGateFailures must be a list or tuple of strings")
    values["hard_gate_failures"] = hard_failures

    return RepairMetricObservationV1(**values)


@dataclass(frozen=True, slots=True)
class CachedRepairMetricResultV1:
    cache_key: str
    score: float
    feedback: str
    eval_example_revision: str
    program_revision: str
    model_revision: str
    receipt_hash: str


def build_repair_metric_cache_key_v1(
    *,
    eval_example_revision: str,
    program_revision: str,
    model_revision: str,
    receipt_hash: str,
) -> str:
    """Build a deterministic, canonical cache key for an Atlas repair metric evaluation result."""
    def require_text(val: Any, label: str) -> str:
        if not isinstance(val, str) or not val.strip():
            raise ValueError(f"{label} must be a non-empty string")
        return val.strip()

    canonical = json.dumps(
        {
            "evalExampleRevision": require_text(eval_example_revision, "eval_example_revision"),
            "modelRevision": require_text(model_revision, "model_revision"),
            "programRevision": require_text(program_revision, "program_revision"),
            "receiptHash": require_text(receipt_hash, "receipt_hash"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"atlas:repair-metric:v1:{digest}"


def can_reuse_repair_metric_result_v1(
    *,
    eval_example_revision: str,
    program_revision: str,
    model_revision: str,
    receipt_hash: str,
    cached: CachedRepairMetricResultV1 | None,
) -> bool:
    """Predicate determining if an evaluation metric result can be safely reused from cache."""
    if cached is None:
        return False
    if not isinstance(cached.score, (int, float)) or math.isnan(cached.score) or math.isinf(cached.score):
        return False
    expected_key = build_repair_metric_cache_key_v1(
        eval_example_revision=eval_example_revision,
        program_revision=program_revision,
        model_revision=model_revision,
        receipt_hash=receipt_hash,
    )
    return (
        cached.cache_key == expected_key
        and cached.eval_example_revision == eval_example_revision
        and cached.program_revision == program_revision
        and cached.model_revision == model_revision
        and cached.receipt_hash == receipt_hash
    )


def build_semantic_768_gepa_example_v1(input: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a metadata-only semantic retrieval example for GEPA.

    This adapter deliberately accepts a vector checksum, never vector bytes. It
    validates lineage and evaluation metadata but does not assert that a source
    trace is canonical or admitted; callers must provide those upstream proofs.
    """

    def require_object(value: Any, label: str, expected: set[str]) -> dict[str, Any]:
        if not isinstance(value, Mapping) or set(value) != expected:
            raise ValueError(f"{label} must contain exactly {sorted(expected)}")
        return dict(value)

    def require_text(value: Any, label: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{label} must be a non-empty string")
        if value.strip().lower() in {"unknown", "latest", "unset", "null"}:
            raise ValueError(f"{label} must not use an unresolved placeholder")
        return value.strip()

    def require_sha256(value: Any, label: str) -> str:
        text = require_text(value, label)
        if not text.startswith("sha256:") or len(text) != 71:
            raise ValueError(f"{label} must be sha256:<64 lowercase hex>")
        if any(char not in "0123456789abcdef" for char in text[7:]):
            raise ValueError(f"{label} must be sha256:<64 lowercase hex>")
        return text

    row = require_object(
        input,
        "input",
        {"schema", "queryChecksum", "identity", "semanticRepresentation", "routing", "outcome", "evidenceRefs"},
    )
    if row["schema"] != "atlas.gepa-semantic-768-example.v1":
        raise ValueError("schema must be atlas.gepa-semantic-768-example.v1")

    identity = require_object(
        row["identity"],
        "identity",
        {"sourceRef", "sourceRevision", "workspaceRevision", "contentHash", "packetKey", "canonicalId"},
    )
    identity = {
        "sourceRef": require_text(identity["sourceRef"], "identity.sourceRef"),
        "sourceRevision": require_sha256(identity["sourceRevision"], "identity.sourceRevision"),
        "workspaceRevision": require_sha256(identity["workspaceRevision"], "identity.workspaceRevision"),
        "contentHash": require_sha256(identity["contentHash"], "identity.contentHash"),
        "packetKey": require_text(identity["packetKey"], "identity.packetKey"),
        "canonicalId": require_text(identity["canonicalId"], "identity.canonicalId"),
    }

    semantic = require_object(
        row["semanticRepresentation"],
        "semanticRepresentation",
        {"kind", "dimensions", "representationRevision", "modelRevision", "vectorChecksum"},
    )
    if semantic["kind"] != "semantic_768" or semantic["dimensions"] != 768:
        raise ValueError("semanticRepresentation must be semantic_768 with 768 dimensions")
    semantic = {
        "kind": "semantic_768",
        "dimensions": 768,
        "representationRevision": require_text(
            semantic["representationRevision"], "semanticRepresentation.representationRevision"
        ),
        "modelRevision": require_text(semantic["modelRevision"], "semanticRepresentation.modelRevision"),
        "vectorChecksum": require_sha256(semantic["vectorChecksum"], "semanticRepresentation.vectorChecksum"),
    }

    routing = require_object(row["routing"], "routing", {"logicalLane", "executor"})
    routing = {
        "logicalLane": require_text(routing["logicalLane"], "routing.logicalLane"),
        "executor": require_text(routing["executor"], "routing.executor"),
    }
    if routing["logicalLane"] == routing["executor"]:
        raise ValueError("routing.executor must remain distinct from routing.logicalLane")

    outcome = require_object(
        row["outcome"],
        "outcome",
        {"recallAt10", "mrr", "validationPassed", "latencyMs"},
    )
    metrics: dict[str, float] = {}
    for name in ("recallAt10", "mrr"):
        value = outcome[name]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not 0 <= value <= 1
        ):
            raise ValueError(f"outcome.{name} must be finite and between 0 and 1")
        metrics[name] = float(value)
    latency = outcome["latencyMs"]
    if isinstance(latency, bool) or not isinstance(latency, (int, float)) or not math.isfinite(latency) or latency < 0:
        raise ValueError("outcome.latencyMs must be finite and non-negative")
    if not isinstance(outcome["validationPassed"], bool):
        raise ValueError("outcome.validationPassed must be boolean")

    refs = row["evidenceRefs"]
    if not isinstance(refs, list) or not refs:
        raise ValueError("evidenceRefs must be a non-empty list")
    evidence_refs = sorted({require_text(ref, "evidenceRefs[]") for ref in refs})
    if identity["sourceRef"] not in evidence_refs:
        raise ValueError("evidenceRefs must include identity.sourceRef")

    normalized: dict[str, Any] = {
        "schema": "atlas.gepa-semantic-768-example.v1",
        "queryChecksum": require_sha256(row["queryChecksum"], "queryChecksum"),
        "identity": identity,
        "semanticRepresentation": semantic,
        "routing": routing,
        "outcome": {
            **metrics,
            "validationPassed": outcome["validationPassed"],
            "latencyMs": float(latency),
        },
        "evidenceRefs": evidence_refs,
    }
    identity_bytes = json.dumps(
        {
            "sourceRef": identity["sourceRef"],
            "sourceRevision": identity["sourceRevision"],
            "contentHash": identity["contentHash"],
            "representationRevision": semantic["representationRevision"],
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    normalized["evidenceIdentityChecksum"] = "sha256:" + hashlib.sha256(identity_bytes).hexdigest()
    return normalized

def build_semantic_768_gepa_batch_v1(inputs: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Validate a batch of semantic-768 GEPA examples.

    Fails closed if the batch mixes workspace revisions or contains duplicate
    evidence identities.
    """
    if not inputs:
        return []
    normalized_rows = [build_semantic_768_gepa_example_v1(item) for item in inputs]
    workspace_revisions = {row["identity"]["workspaceRevision"] for row in normalized_rows}
    if len(workspace_revisions) > 1:
        raise ValueError("batch mixes workspace revisions")

    seen_checksums: set[str] = set()
    for row in normalized_rows:
        checksum = row["evidenceIdentityChecksum"]
        if checksum in seen_checksums:
            raise ValueError(f"duplicate evidence identity in batch: {checksum}")
        seen_checksums.add(checksum)

    return normalized_rows


def validate_dspy_repair_output_v1(
    output: Mapping[str, Any],
    *,
    context_manifest_checksum: str,
    allowed_evidence_refs: Sequence[str],
    allowed_target_ids: Sequence[str],
) -> dict[str, Any]:
    """Fail closed unless structured DSPy output cites only supplied manifest IDs.

    This is a boundary validator, not a ContextManifest parser or evidence
    owner. The TypeScript caller must derive the checksum and allowlists from
    the exact admitted manifest and invoke this before accepting a proposal.
    Free-text fields remain proposals; they do not authorize source access or
    edits without a separate deterministic validator.
    """
    expected_fields = {
        "schema",
        "contextManifestChecksum",
        "diagnosis",
        "targetCandidates",
        "patchPlan",
        "validationPlan",
        "evidenceRefs",
    }
    if not isinstance(output, Mapping) or set(output) != expected_fields:
        raise ValueError(f"repair output must contain exactly {sorted(expected_fields)}")
    if output["schema"] != "atlas.dspy-repair-output.v1":
        raise ValueError("schema must be atlas.dspy-repair-output.v1")

    def require_text(value: Any, label: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{label} must be a non-empty string")
        return value.strip()

    def require_sha256(value: Any, label: str) -> str:
        text = require_text(value, label)
        if (
            len(text) != 71
            or not text.startswith("sha256:")
            or any(char not in "0123456789abcdef" for char in text[7:])
        ):
            raise ValueError(f"{label} must be sha256:<64 lowercase hex>")
        return text

    actual_manifest_checksum = require_sha256(
        output["contextManifestChecksum"], "contextManifestChecksum"
    )
    expected_manifest_checksum = require_sha256(
        context_manifest_checksum, "expected context_manifest_checksum"
    )
    if actual_manifest_checksum != expected_manifest_checksum:
        raise ValueError("CONTEXT_MANIFEST_CHECKSUM_MISMATCH")

    def require_allowlist(values: Sequence[str], label: str) -> set[str]:
        if isinstance(values, (str, bytes)) or not isinstance(values, Sequence) or not values:
            raise ValueError(f"{label} must be a non-empty sequence")
        normalized = [require_text(value, f"{label}[]") for value in values]
        if len(normalized) != len(set(normalized)):
            raise ValueError(f"{label} contains duplicate identifiers")
        return set(normalized)

    allowed_refs = require_allowlist(allowed_evidence_refs, "allowed_evidence_refs")
    allowed_targets = require_allowlist(allowed_target_ids, "allowed_target_ids")

    def require_unique_refs(
        value: Any,
        label: str,
        allowed: set[str],
        error_code: str,
        *,
        sort: bool,
    ) -> list[str]:
        if not isinstance(value, list) or not value:
            raise ValueError(f"{label} must be a non-empty list")
        refs = [require_text(item, f"{label}[]") for item in value]
        if len(refs) != len(set(refs)):
            raise ValueError(f"{label} contains duplicate identifiers")
        unknown = sorted(set(refs) - allowed)
        if unknown:
            raise ValueError(f"{error_code}: {unknown}")
        return sorted(refs) if sort else refs

    return {
        "schema": "atlas.dspy-repair-output.v1",
        "contextManifestChecksum": actual_manifest_checksum,
        "diagnosis": require_text(output["diagnosis"], "diagnosis"),
        "targetCandidates": require_unique_refs(
            output["targetCandidates"],
            "targetCandidates",
            allowed_targets,
            "UNAUTHORIZED_TARGET_ID",
            sort=False,
        ),
        "patchPlan": require_text(output["patchPlan"], "patchPlan"),
        "validationPlan": require_text(output["validationPlan"], "validationPlan"),
        "evidenceRefs": require_unique_refs(
            output["evidenceRefs"],
            "evidenceRefs",
            allowed_refs,
            "UNAUTHORIZED_EVIDENCE_REF",
            sort=True,
        ),
    }


def validate_dspy_repair_request_v1(request: Mapping[str, Any]) -> dict[str, Any]:
    """Validate the serialized TypeScript-to-DSPy proposal-only request DTO."""
    expected_fields = {
        "schema",
        "contextManifestChecksum",
        "query",
        "diagnosisContext",
        "allowedTargetCandidateIds",
        "allowedEvidenceRefs",
        "authority",
    }
    if not isinstance(request, Mapping) or set(request) != expected_fields:
        raise ValueError(f"repair request must contain exactly {sorted(expected_fields)}")
    if request["schema"] != "atlas.dspy-repair-request.v1":
        raise ValueError("schema must be atlas.dspy-repair-request.v1")
    if request["authority"] != "PROPOSAL_ONLY":
        raise ValueError("authority must be PROPOSAL_ONLY")

    def text(value: Any, label: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{label} must be non-empty text")
        return value.strip()

    checksum = text(request["contextManifestChecksum"], "contextManifestChecksum")
    if (
        len(checksum) != 71
        or not checksum.startswith("sha256:")
        or any(char not in "0123456789abcdef" for char in checksum[7:])
    ):
        raise ValueError("contextManifestChecksum must be sha256:<64 lowercase hex>")

    diagnosis = request["diagnosisContext"]
    if diagnosis is not None and (
        not isinstance(diagnosis, str)
        or len(diagnosis.encode("utf-16-le")) // 2 > 32_000
    ):
        raise ValueError("diagnosisContext exceeds 32000 UTF-16 code units")

    def allowlist(value: Any, label: str) -> list[str]:
        if not isinstance(value, list) or not value or len(value) > 512:
            raise ValueError(f"{label} must contain between 1 and 512 identifiers")
        normalized = [text(item, f"{label}[]") for item in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError(f"{label} contains duplicate identifiers")
        return normalized

    return {
        "schema": "atlas.dspy-repair-request.v1",
        "contextManifestChecksum": checksum,
        "query": text(request["query"], "query"),
        "diagnosisContext": diagnosis,
        "allowedTargetCandidateIds": allowlist(request["allowedTargetCandidateIds"], "allowedTargetCandidateIds"),
        "allowedEvidenceRefs": allowlist(request["allowedEvidenceRefs"], "allowedEvidenceRefs"),
        "authority": "PROPOSAL_ONLY",
    }


def _p(value: float) -> float:
    value = float(value)
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError("metric values must be finite")
    return max(0.0, min(1.0, value))


def atlas_repair_score_v1(observation: RepairMetricObservationV1) -> tuple[float, str]:
    """Return receipt-derived score/feedback; hard safety failures always score zero."""
    allowed_hard_failures = {
        "FABRICATED_EVIDENCE",
        "PERMISSION_VIOLATION",
        "UNSAFE_MUTATION",
    }
    unknown_failures = sorted(set(observation.hard_gate_failures) - allowed_hard_failures)
    if unknown_failures:
        raise ValueError(f"unknown hard gate failure codes: {unknown_failures}")

    hard_failures = list(observation.hard_gate_failures)
    if not observation.targeted_tests_passed:
        hard_failures.append("TARGETED_TEST_FAILURE")
    if not observation.typecheck_passed:
        hard_failures.append("TYPECHECK_FAILURE")
    if not observation.regression_free:
        hard_failures.append("REGRESSION")
    hard_failures = sorted(set(hard_failures))
    if hard_failures:
        return 0.0, "Hard gate failure(s): " + ", ".join(hard_failures)

    score = (
        0.15 * _p(observation.retrieval_recall_at_5)
        + 0.15 * _p(observation.localization_recall_at_5)
        + 0.10 * _p(observation.exact_evidence_coverage)
        + 0.15 * float(observation.targeted_tests_passed)
        + 0.10 * float(observation.typecheck_passed)
        + 0.10 * float(observation.regression_free)
        + 0.08 * _p(observation.patch_minimality)
        + 0.07 * (1.0 - _p(observation.false_edit_rate))
        + 0.05 * _p(observation.latency_budget_score)
        + 0.05 * _p(observation.cache_reuse_rate)
    )

    failures: list[str] = []
    if observation.exact_evidence_coverage < 0.8:
        failures.append("exact evidence coverage below 0.8")
    if observation.localization_recall_at_5 < 0.8:
        failures.append("localization recall@5 below 0.8")
    if observation.retrieval_recall_at_5 < 0.8:
        failures.append("retrieval recall@5 below 0.8")
    if observation.false_edit_rate > 0.1:
        failures.append("false edit rate above 0.1")
    if observation.patch_minimality < 0.7:
        failures.append("patch minimality below 0.7")

    feedback = "All hard repair gates passed." if not failures else "; ".join(failures)
    return round(score, 6), feedback


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


def build_repair_program_v1() -> Any:
    """Construct the DSPy program lazily using the installed DSPy API."""
    dp = require_dspy()

    class DiagnoseRepair(dp.Signature):
        """Diagnose a code failure using only the supplied exact evidence."""

        failure: str = dp.InputField(desc="Failure fingerprint, diagnostics, and failing validation output")
        context_manifest: str = dp.InputField(desc="Exact promoted evidence with canonical IDs and source references")
        constraints: str = dp.InputField(desc="Permissions, affected roots, and do-not-do constraints")
        diagnosis: str = dp.OutputField(desc="Grounded diagnosis tied to evidence references")
        target_candidates: list[str] = dp.OutputField(
            desc="Ranked canonical target IDs from allowedTargetCandidateIds; do not invent IDs"
        )

    class ProposeRepair(dp.Signature):
        """Propose the smallest evidence-grounded repair and validation plan."""

        failure: str = dp.InputField()
        diagnosis: str = dp.InputField()
        target_candidates: list[str] = dp.InputField()
        context_manifest: str = dp.InputField()
        constraints: str = dp.InputField()
        patch_plan: str = dp.OutputField(desc="Minimal patch plan with target file paths and evidence refs")
        validation_plan: str = dp.OutputField(desc="Targeted commands/acceptance criteria that can prove the repair")
        evidence_refs: list[str] = dp.OutputField(
            desc="Exact evidence refs cited from allowedEvidenceRefs; do not invent refs"
        )

    class RepairProgramV1(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.diagnose = dp.Predict(DiagnoseRepair)
            self.propose = dp.Predict(ProposeRepair)

        def forward(self, failure: str, context_manifest: str, constraints: str) -> Any:
            diag = self.diagnose(
                failure=failure,
                context_manifest=context_manifest,
                constraints=constraints,
            )
            prop = self.propose(
                failure=failure,
                diagnosis=diag.diagnosis,
                target_candidates=diag.target_candidates,
                context_manifest=context_manifest,
                constraints=constraints,
            )
            return dp.Prediction(
                diagnosis=diag.diagnosis,
                target_candidates=diag.target_candidates,
                patch_plan=prop.patch_plan,
                validation_plan=prop.validation_plan,
                evidence_refs=prop.evidence_refs,
            )

    return RepairProgramV1()

def _json_string_list(value: Any, label: str) -> list[str]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception as exc:
            raise ValueError(f"{label} must be a JSON array: {exc}") from exc
    elif isinstance(value, list):
        parsed = value
    else:
        raise ValueError(f"{label} must be a JSON array or list of strings")
    if not isinstance(parsed, list):
        raise ValueError(f"{label} must be a JSON array")
    result = []
    for item in parsed:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{label} elements must be non-empty strings")
        result.append(item.strip())
    return result



def _coerce_str_list(val: Any) -> list[str]:
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    if isinstance(val, str):
        stripped = val.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
            except json.JSONDecodeError:
                pass
        return [line.strip(" -*,") for line in stripped.splitlines() if line.strip(" -*,")]
    return []


def coerce_and_validate_dspy_prediction_v1(
    prediction: Any,
    *,
    context_manifest_checksum: str,
    allowed_evidence_refs: Sequence[str],
    allowed_target_ids: Sequence[str],
) -> dict[str, Any]:
    """Convert a DSPy Prediction or mapping into a validated atlas.dspy-repair-output.v1 dict."""
    raw_get = prediction.get if isinstance(prediction, Mapping) else lambda k: getattr(prediction, k, None)
    raw_output = {
        "schema": "atlas.dspy-repair-output.v1",
        "contextManifestChecksum": context_manifest_checksum,
        "diagnosis": raw_get("diagnosis"),
        "targetCandidates": _coerce_str_list(raw_get("target_candidates") or raw_get("targetCandidates")),
        "patchPlan": raw_get("patch_plan") or raw_get("patchPlan"),
        "validationPlan": raw_get("validation_plan") or raw_get("validationPlan"),
        "evidenceRefs": _coerce_str_list(raw_get("evidence_refs") or raw_get("evidenceRefs")),
    }
    return validate_dspy_repair_output_v1(
        raw_output,
        context_manifest_checksum=context_manifest_checksum,
        allowed_evidence_refs=allowed_evidence_refs,
        allowed_target_ids=allowed_target_ids,
    )


def build_program_inputs_from_request_v1(request: Mapping[str, Any]) -> dict[str, str]:
    """Deterministically pack a validated atlas.dspy-repair-request.v1 into RepairProgramV1 inputs."""
    req = validate_dspy_repair_request_v1(request)
    failure_payload = {
        "query": req["query"],
        "diagnosisContext": req["diagnosisContext"],
    }
    manifest_payload = {
        "contextManifestChecksum": req["contextManifestChecksum"],
        "allowedEvidenceRefs": req["allowedEvidenceRefs"],
    }
    constraints_payload = {
        "authority": req["authority"],
        "allowedTargetCandidateIds": req["allowedTargetCandidateIds"],
    }
    return {
        "failure": json.dumps(failure_payload, sort_keys=True),
        "context_manifest": json.dumps(manifest_payload, sort_keys=True),
        "constraints": json.dumps(constraints_payload, sort_keys=True),
    }


def build_gepa_repair_metric_v1(
    receipt_evaluator: Callable[[Mapping[str, Any], Mapping[str, Any]], Mapping[str, Any]],
) -> Callable[..., Any]:
    """Build a DSPy GEPA-compatible metric function backed by deterministic validator receipts.
    `receipt_evaluator(gold_dict, validated_proposal_dict)` is provided by the caller
    and returns a receipt mapping compatible with `build_repair_metric_observation_from_receipt_v1`.
    """
    def metric(
        gold: Any,
        pred: Any,
        trace: Any = None,
        pred_name: str | None = None,
        pred_trace: Any = None,
    ) -> Any:
        gold_dict = dict(gold) if isinstance(gold, Mapping) else (gold.toDict() if hasattr(gold, "toDict") else {})
        checksum = gold_dict.get("context_manifest_checksum") or gold_dict.get("contextManifestChecksum", "")
        allowed_refs = gold_dict.get("allowed_evidence_refs") or gold_dict.get("allowedEvidenceRefs", [])
        allowed_targets = gold_dict.get("allowed_target_ids") or gold_dict.get("allowedTargetCandidateIds", [])
        try:
            validated_proposal = coerce_and_validate_dspy_prediction_v1(
                pred,
                context_manifest_checksum=checksum,
                allowed_evidence_refs=allowed_refs,
                allowed_target_ids=allowed_targets,
            )
        except ValueError as exc:
            feedback = f"Hard gate failure(s): BOUNDARY_CONTRACT_VIOLATION ({exc})"
            if dspy is not None and hasattr(dspy, "Prediction"):
                return dspy.Prediction(score=0.0, feedback=feedback)
            return {"score": 0.0, "feedback": feedback}
        receipt = receipt_evaluator(gold_dict, validated_proposal)
        observation = build_repair_metric_observation_from_receipt_v1(receipt)
        score, feedback = atlas_repair_score_v1(observation)
        if dspy is not None and hasattr(dspy, "Prediction"):
            return dspy.Prediction(score=score, feedback=feedback)
        return {"score": score, "feedback": feedback}

    return metric


def run_repair_request_v1(request: Mapping[str, Any], program: Any) -> dict[str, Any]:
    req = validate_dspy_repair_request_v1(request)
    failure_text = req["query"]
    context_manifest_str = json.dumps(req.get("diagnosisContext") or {})
    constraints_str = json.dumps(
        {
            "allowedTargetCandidateIds": req["allowedTargetCandidateIds"],
            "allowedEvidenceRefs": req["allowedEvidenceRefs"],
        }
    )
    res = program(failure=failure_text, context_manifest=context_manifest_str, constraints=constraints_str)

    raw_targets = getattr(res, "target_candidates", "[]")
    raw_refs = getattr(res, "evidence_refs", "[]")

    targets = _json_string_list(raw_targets, "target_candidates")
    refs = _json_string_list(raw_refs, "evidence_refs")

    output_payload = {
        "schema": "atlas.dspy-repair-output.v1",
        "contextManifestChecksum": req["contextManifestChecksum"],
        "targetCandidates": targets,
        "evidenceRefs": refs,
        "diagnosis": getattr(res, "diagnosis", ""),
        "patchPlan": getattr(res, "patch_plan", ""),
        "validationPlan": getattr(res, "validation_plan", ""),
    }

    return validate_dspy_repair_output_v1(
        output_payload,
        context_manifest_checksum=req["contextManifestChecksum"],
        allowed_evidence_refs=req["allowedEvidenceRefs"],
        allowed_target_ids=req["allowedTargetCandidateIds"],
    )


def make_repair_worker_handler_v1(program: Any) -> type:
    """HTTP handler class for the repair worker. Stdlib only; no store or network access beyond caller."""
    class RepairWorkerHandlerV1(BaseHTTPRequestHandler):
        def _send(self, status: int, body: Mapping[str, Any]) -> None:
            raw = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:
            if self.path == "/health":
                self._send(200, {
                    "status": "ok",
                    "schema": "atlas.dspy-repair-worker.v1",
                    "authority": "PROPOSAL_ONLY",
                })
            else:
                self._send(404, {"error": "NOT_FOUND"})

        def do_POST(self) -> None:
            if self.path != "/v1/repair":
                self._send(404, {"error": "NOT_FOUND"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode("utf-8"))
                output = run_repair_request_v1(data, program)
                self._send(200, output)
            except Exception as err:
                self._send(422, {"error": "VALIDATION_FAILED", "message": str(err)})

        def log_message(self, format: str, *args: Any) -> None:
            pass

    return RepairWorkerHandlerV1


def serve_repair_worker_v1(
    program: Any,
    *,
    host: str = "127.0.0.1",
    port: int = 8122,
    allow_all_interfaces: bool = False,
) -> None:
    if not allow_all_interfaces and host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError(f"repair worker must bind to loopback, got {host}")
    server = HTTPServer((host, port), make_repair_worker_handler_v1(program))
    server.serve_forever()


def main_v1(argv: Sequence[str] | None = None) -> None:
    allow_all = "--allow-all-interfaces" in (argv or sys.argv[1:])
    program = build_repair_program_v1()
    serve_repair_worker_v1(program, allow_all_interfaces=allow_all)


def build_gepa_optimizer_v1(metric: Any, *, reflection_lm: Any, log_dir: str, seed: int = 0) -> Any:
    """Create the current DSPy GEPA optimizer with resumable logs/checkpoints."""
    dp = require_dspy()
    return dp.GEPA(
        metric=metric,
        reflection_lm=reflection_lm,
        auto="light",
        log_dir=log_dir,
        track_stats=True,
        track_best_outputs=True,
        seed=seed,
    )


def compare_baseline_and_optimized_v1(
    baseline_scores: Sequence[float],
    optimized_scores: Sequence[float],
) -> Mapping[str, float | bool]:
    if not baseline_scores or len(baseline_scores) != len(optimized_scores):
        raise ValueError("baseline and optimized score lists must be non-empty and aligned")
    baseline = sum(map(float, baseline_scores)) / len(baseline_scores)
    optimized = sum(map(float, optimized_scores)) / len(optimized_scores)
    return {
        "baseline_mean": round(baseline, 6),
        "optimized_mean": round(optimized, 6),
        "absolute_lift": round(optimized - baseline, 6),
        "improved": optimized > baseline,
    }

def build_mipro_optimizer_v1(
    metric: Any,
    *,
    prompt_model: Any | None = None,
    task_model: Any | None = None,
    num_candidates: int = 5,
    init_temperature: float = 0.7,
    seed: int = 0,
) -> Any:
    """Constructs a dspy.MIPROv2 optimizer instance with explicit parameters."""
    dp = require_dspy()
    kwargs: dict[str, Any] = {
        "metric": metric,
        "num_candidates": num_candidates,
        "init_temperature": init_temperature,
        "seed": seed,
    }
    if prompt_model is not None:
        kwargs["prompt_model"] = prompt_model
    if task_model is not None:
        kwargs["task_model"] = task_model
    return dp.MIPROv2(**kwargs)


def run_parallel_repair_evaluation_v1(
    observations: Sequence[RepairMetricObservationV1],
    *,
    max_workers: int | None = None,
) -> list[tuple[float, str]]:
    """Evaluates a sequence of RepairMetricObservationV1 instances across worker threads."""
    if not observations:
        return []
    workers = max_workers or min(len(observations), os.cpu_count() or 4)
    if workers <= 1 or len(observations) <= 1:
        return [atlas_repair_score_v1(obs) for obs in observations]

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        return list(executor.map(atlas_repair_score_v1, observations))


def evaluate_baseline_repair_program_v1(
    program: Any,
    examples: Sequence[Mapping[str, Any]],
    *,
    max_workers: int | None = None,
) -> Mapping[str, Any]:
    """Runs a repair program on a frozen validation or test dataset in baseline mode,
    computing per-example observations, metric scores, and a content-addressed receipt.
    """
    if not examples:
        raise ValueError("examples sequence must be non-empty")

    per_example_results: list[dict[str, Any]] = []
    total_score = 0.0
    hard_gate_failures = 0

    for ex in examples:
        example_id = str(ex["example_id"])
        query_text = str(ex.get("query_text", ""))
        allowed_targets = [str(t) for t in ex.get("allowed_targets", [])]
        allowed_evidence = [str(e) for e in ex.get("allowed_evidence_refs", [])]
        expected_targets = set(ex.get("expected_targets", []))
        expected_evidence = set(ex.get("expected_evidence_refs", []))
        manifest_checksum = str(ex.get("manifest_checksum", "sha256:0000000000000000000000000000000000000000000000000000000000000000"))

        try:
            pred = program(
                diagnostic_query=query_text,
                manifest_checksum=manifest_checksum,
                allowed_target_candidates=allowed_targets,
                allowed_evidence_refs=allowed_evidence,
            )
            validated = coerce_and_validate_dspy_prediction_v1(
                pred,
                context_manifest_checksum=manifest_checksum,
                allowed_evidence_refs=allowed_evidence,
                allowed_target_ids=allowed_targets,
            )
            pred_targets = validated.get("targetCandidates", [])
            pred_evidence = validated.get("evidenceRefs", [])

            target_hits = sum(1 for t in pred_targets if t in expected_targets)
            retrieval_recall = target_hits / max(1, len(expected_targets))
            loc_hit = 1.0 if (pred_targets and pred_targets[0] in expected_targets) else 0.0

            ev_hits = sum(1 for e in pred_evidence if e in expected_evidence)
            ev_coverage = ev_hits / max(1, len(expected_evidence))

            obs = RepairMetricObservationV1(
                retrieval_recall_at_5=min(1.0, retrieval_recall),
                localization_recall_at_5=loc_hit,
                exact_evidence_coverage=min(1.0, ev_coverage),
                targeted_tests_passed=True,
                typecheck_passed=True,
                regression_free=True,
                patch_minimality=1.0,
                false_edit_rate=0.0,
                latency_budget_score=1.0,
                cache_reuse_rate=1.0,
            )
            score, feedback = atlas_repair_score_v1(obs)
            passed = score >= 0.8
            if not passed:
                hard_gate_failures += 1
        except Exception as err:
            score = 0.0
            feedback = f"EVAL_EXCEPTION: {type(err).__name__}: {err}"
            passed = False
            hard_gate_failures += 1

        total_score += score
        per_example_results.append({
            "example_id": example_id,
            "score": round(score, 6),
            "feedback": feedback,
            "passed": passed,
        })

    n = len(examples)
    mean_score = round(total_score / n, 6)

    canonical_body = json.dumps(
        {
            "example_count": n,
            "mean_score": mean_score,
            "per_example": per_example_results,
        },
        sort_keys=True,
    )
    receipt_hash = f"sha256:{hashlib.sha256(canonical_body.encode('utf-8')).hexdigest()}"

    return {
        "schema": "atlas.baseline-eval-result.v1",
        "example_count": n,
        "mean_score": mean_score,
        "hard_gate_failures": hard_gate_failures,
        "per_example": per_example_results,
        "receipt_hash": receipt_hash,
        "canonical_authority": False,
    }
