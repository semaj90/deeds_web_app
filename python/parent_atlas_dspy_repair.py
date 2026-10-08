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
from typing import Any, Mapping, Sequence

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

        failure = dp.InputField(desc="Failure fingerprint, diagnostics, and failing validation output")
        context_manifest = dp.InputField(desc="Exact promoted evidence with canonical IDs and source references")
        constraints = dp.InputField(desc="Permissions, affected roots, and do-not-do constraints")
        diagnosis = dp.OutputField(desc="Grounded diagnosis tied to evidence references")
        target_candidates = dp.OutputField(desc="Ranked canonical target IDs/source refs; do not invent evidence")

    class ProposeRepair(dp.Signature):
        """Propose the smallest evidence-grounded repair and validation plan."""

        failure = dp.InputField()
        diagnosis = dp.InputField()
        context_manifest = dp.InputField()
        constraints = dp.InputField()
        patch_plan = dp.OutputField(desc="Minimal patch plan with target file paths and evidence refs")
        validation_plan = dp.OutputField(desc="Targeted commands/acceptance criteria that can prove the repair")

    class RepairProgramV1(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.diagnose = dp.Predict(DiagnoseRepair)
            self.propose = dp.Predict(ProposeRepair)

        def forward(self, failure: str, context_manifest: str, constraints: str) -> Any:
            diagnosis = self.diagnose(
                failure=failure,
                context_manifest=context_manifest,
                constraints=constraints,
            )
            proposal = self.propose(
                failure=failure,
                diagnosis=diagnosis.diagnosis,
                context_manifest=context_manifest,
                constraints=constraints,
            )
            return dp.Prediction(
                diagnosis=diagnosis.diagnosis,
                target_candidates=diagnosis.target_candidates,
                patch_plan=proposal.patch_plan,
                validation_plan=proposal.validation_plan,
            )

    return RepairProgramV1()


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
