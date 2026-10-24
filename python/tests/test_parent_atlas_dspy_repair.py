from copy import deepcopy

import pytest

from python.parent_atlas_dspy_repair import (
    RepairMetricObservationV1,
    admit_agentic_repair_example_v1,
    atlas_repair_score_v1,
    build_repair_metric_cache_key_v1,
    build_repair_metric_observation_from_receipt_v1,
    can_reuse_repair_metric_result_v1,
    CachedRepairMetricResultV1,
    build_semantic_768_gepa_batch_v1,
    build_semantic_768_gepa_example_v1,
    compare_baseline_and_optimized_v1,
    validate_dspy_repair_output_v1,
    validate_dspy_repair_request_v1,
    coerce_and_validate_dspy_prediction_v1,
    build_program_inputs_from_request_v1,
    build_gepa_repair_metric_v1,
)


def _semantic_768_example():
    digest = "sha256:" + "a" * 64
    return {
        "schema": "atlas.gepa-semantic-768-example.v1",
        "queryChecksum": digest,
        "identity": {
            "sourceRef": "src/example.ts#symbol:run",
            "sourceRevision": digest,
            "workspaceRevision": digest,
            "contentHash": digest,
            "packetKey": "packet:example",
            "canonicalId": "function:example.run",
        },
        "semanticRepresentation": {
            "kind": "semantic_768",
            "dimensions": 768,
            "representationRevision": "repr:embeddinggemma-pinned-policy-v1",
            "modelRevision": "model:sha256:artifact-revision",
            "vectorChecksum": digest,
        },
        "routing": {"logicalLane": "dense", "executor": "qdrant"},
        "outcome": {
            "recallAt10": 0.9,
            "mrr": 0.75,
            "validationPassed": True,
            "latencyMs": 12.5,
        },
        "evidenceRefs": ["src/example.ts#symbol:run"],
    }


def _repair_output():
    digest = "sha256:" + "a" * 64
    return {
        "schema": "atlas.dspy-repair-output.v1",
        "contextManifestChecksum": digest,
        "diagnosis": "The symbol uses an outdated cache key.",
        "targetCandidates": ["function:cache.lookup", "file:src/cache.ts"],
        "patchPlan": "Update the key derivation and preserve the prior read path.",
        "validationPlan": "Run the cache contract tests and typecheck.",
        "evidenceRefs": ["src/cache.ts#symbol:lookup", "tests/cache.test.ts"],
    }


def _agentic_repair_example():
    content = b"before\nrepair this function\nafter\n"
    digest = lambda value: "sha256:" + value * 64
    start = content.index(b"repair this function")
    return {
        "schema": "atlas.agentic-repair-example.v1",
        "taskId": "task:example",
        "canonicalId": "function:example.run",
        "packetKey": "packet:example",
        "sourceRevision": digest("a"),
        "workspaceRevision": digest("b"),
        "sourceRefs": [{
            "locator": {
                "schema": "atlas.evidence-locator.v1",
                "canonicalId": "function:example.run",
                "packetKey": "packet:example",
                "sourceRef": "src/example.py",
                "sourceKind": "code_file",
                "filePath": "src/example.py",
                "sourceUrl": None,
                "contentHash": "sha256:" + __import__("hashlib").sha256(content).hexdigest(),
                "workspaceRevision": digest("b"),
                "sourceRevision": digest("a"),
                "span": {"startByte": start, "endByte": start + len(b"repair this function")},
                "domain": None,
            },
            "surface": "repair this function",
        }],
        "error": {"class": "TYPECHECK", "code": "TS2322", "message": "Type mismatch", "failingCommand": "npm run check", "failingTest": None},
        "retrieval": {"queryText": "repair type mismatch", "semanticRecipe": "semantic_768", "candidateIds": ["function:example.run"]},
        "expectedOutcome": {"validatorIds": ["validator:typecheck"], "mutationAllowed": False},
    }, content


def test_agentic_repair_example_requires_exact_grounded_source_and_qualified_inputs():
    example, content = _agentic_repair_example()
    admitted = admit_agentic_repair_example_v1(
        example,
        source_bytes_by_ref={"src/example.py": content},
        qualified_candidate_ids=["function:example.run"],
        known_validator_ids=["validator:typecheck"],
    )
    assert admitted["sourceRefs"][0]["surface"] == "repair this function"
    assert admitted["expectedOutcome"]["mutationAllowed"] is False


@pytest.mark.parametrize("failure", ["empty_refs", "bad_span", "unknown_revision", "unqualified_candidate", "unknown_validator", "mutation"])
def test_agentic_repair_example_fails_closed(failure):
    example, content = _agentic_repair_example()
    if failure == "empty_refs":
        example["sourceRefs"] = []
    elif failure == "bad_span":
        example["sourceRefs"][0]["surface"] = "fabricated"
    elif failure == "unknown_revision":
        example["workspaceRevision"] = "unknown"
    elif failure == "unqualified_candidate":
        example["retrieval"]["candidateIds"] = ["candidate:unresolved"]
    elif failure == "unknown_validator":
        example["expectedOutcome"]["validatorIds"] = ["validator:invented"]
    else:
        example["expectedOutcome"]["mutationAllowed"] = True
    with pytest.raises(ValueError):
        admit_agentic_repair_example_v1(
            example,
            source_bytes_by_ref={"src/example.py": content},
            qualified_candidate_ids=["function:example.run"],
            known_validator_ids=["validator:typecheck"],
        )


def test_semantic_768_gepa_example_is_metadata_only_and_deterministic():
    example = _semantic_768_example()
    normalized = build_semantic_768_gepa_example_v1(example)

    assert normalized == build_semantic_768_gepa_example_v1(example)
    assert normalized["semanticRepresentation"]["dimensions"] == 768
    assert normalized["identity"]["packetKey"] == "packet:example"
    assert normalized["evidenceIdentityChecksum"].startswith("sha256:")
    assert set(normalized["semanticRepresentation"]) == {
        "kind",
        "dimensions",
        "representationRevision",
        "modelRevision",
        "vectorChecksum",
    }
    changed = deepcopy(example)
    changed["identity"]["contentHash"] = "sha256:" + "b" * 64
    assert (
        build_semantic_768_gepa_example_v1(changed)["evidenceIdentityChecksum"]
        != normalized["evidenceIdentityChecksum"]
    )


def test_semantic_768_batch_accepts_distinct_evidence_identities():
    first = _semantic_768_example()
    second = deepcopy(first)
    second["identity"]["contentHash"] = "sha256:" + "b" * 64
    second["identity"]["canonicalId"] = "function:example.other"
    rows = build_semantic_768_gepa_batch_v1([first, second])
    assert len(rows) == 2
    assert rows[0]["evidenceIdentityChecksum"] != rows[1]["evidenceIdentityChecksum"]


def test_semantic_768_batch_rejects_mixed_workspace_revisions():
    first = _semantic_768_example()
    second = deepcopy(first)
    second["identity"]["canonicalId"] = "function:example.other"
    second["identity"]["workspaceRevision"] = "sha256:" + "c" * 64
    with pytest.raises(ValueError, match="mixes workspace revisions"):
        build_semantic_768_gepa_batch_v1([first, second])


@pytest.mark.parametrize(
    "field",
    ["sourceRevision", "contentHash", "workspaceRevision", "packetKey", "canonicalId"],
)
def test_semantic_768_example_rejects_missing_identity_field(field):
    example = deepcopy(_semantic_768_example())
    example["identity"].pop(field)
    with pytest.raises(ValueError, match="exactly"):
        build_semantic_768_gepa_example_v1(example)


@pytest.mark.parametrize("field", ["representationRevision", "modelRevision", "vectorChecksum"])
def test_semantic_768_example_rejects_missing_representation_field(field):
    example = deepcopy(_semantic_768_example())
    example["semanticRepresentation"].pop(field)
    with pytest.raises(ValueError, match="exactly"):
        build_semantic_768_gepa_example_v1(example)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("sourceRevision", "sha256:" + "d" * 64),
        ("contentHash", "sha256:" + "e" * 64),
    ],
)
def test_semantic_768_source_revision_change_changes_evidence_identity_checksum(field, value):
    base = _semantic_768_example()
    changed = deepcopy(base)
    changed["identity"][field] = value
    assert (
        build_semantic_768_gepa_example_v1(changed)["evidenceIdentityChecksum"]
        != build_semantic_768_gepa_example_v1(base)["evidenceIdentityChecksum"]
    )


def test_semantic_768_workspace_change_is_not_part_of_evidence_identity():
    # Spec identity is source_ref + source_revision + content_hash + representation_revision.
    # Workspace snapshots are guarded per batch (see the mixed-workspace test), not per evidence item.
    base = _semantic_768_example()
    changed = deepcopy(base)
    changed["identity"]["workspaceRevision"] = "sha256:" + "f" * 64
    assert (
        build_semantic_768_gepa_example_v1(changed)["evidenceIdentityChecksum"]
        == build_semantic_768_gepa_example_v1(base)["evidenceIdentityChecksum"]
    )


def test_semantic_768_batch_rejects_same_evidence_counted_twice():
    # Same source, revision, content and representation under a different packet key or model
    # revision is still one evidence item and must not become two training examples.
    first = _semantic_768_example()
    second = deepcopy(first)
    second["identity"]["packetKey"] = "packet:example-copy"
    second["semanticRepresentation"]["modelRevision"] = "model:other-revision"
    with pytest.raises(ValueError, match="duplicate evidence identity"):
        build_semantic_768_gepa_batch_v1([first, second])


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda x: x.update(queryChecksum="sha256:" + "g" * 64), "lowercase hex"),
        (lambda x: x["identity"].update(sourceRevision="unknown"), "placeholder"),
        (lambda x: x["identity"].pop("packetKey"), "exactly"),
        (lambda x: x["semanticRepresentation"].update(dimensions=384), "768 dimensions"),
        (lambda x: x["semanticRepresentation"].update(vector=[0.0] * 768), "exactly"),
        (lambda x: x["routing"].update(executor="dense"), "distinct"),
        (lambda x: x.update(evidenceRefs=["other.ts"]), "include identity.sourceRef"),
    ],
)
def test_semantic_768_gepa_example_fails_closed(mutate, message):
    example = deepcopy(_semantic_768_example())
    mutate(example)
    with pytest.raises(ValueError, match=message):
        build_semantic_768_gepa_example_v1(example)


def test_dspy_repair_output_accepts_only_manifest_bound_refs_and_preserves_rank_order():
    digest = "sha256:" + "a" * 64
    output = _repair_output()
    validated = validate_dspy_repair_output_v1(
        output,
        context_manifest_checksum=digest,
        allowed_evidence_refs=["tests/cache.test.ts", "src/cache.ts#symbol:lookup"],
        allowed_target_ids=["file:src/cache.ts", "function:cache.lookup"],
    )
    assert validated["targetCandidates"] == ["function:cache.lookup", "file:src/cache.ts"]
    assert validated["evidenceRefs"] == ["src/cache.ts#symbol:lookup", "tests/cache.test.ts"]


def test_dspy_repair_request_contract_is_strict_and_normalizes_allowlists():
    request = {
        "schema": "atlas.dspy-repair-request.v1",
        "contextManifestChecksum": "sha256:" + "a" * 64,
        "query": "  inspect cache lookup  ",
        "diagnosisContext": None,
        "allowedTargetCandidateIds": [" file:cache.ts ", "function:cache.lookup"],
        "allowedEvidenceRefs": ["src/cache.ts", "tests/cache.test.ts"],
        "authority": "PROPOSAL_ONLY",
    }
    validated = validate_dspy_repair_request_v1(request)
    assert validated["query"] == "inspect cache lookup"
    assert validated["allowedTargetCandidateIds"] == ["file:cache.ts", "function:cache.lookup"]
    assert validated["diagnosisContext"] is None


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda x: x.update(contextManifestChecksum="sha256:" + "z" * 64), "contextManifestChecksum"),
        (lambda x: x.update(allowedEvidenceRefs=["src/cache.ts", "src/cache.ts"]), "duplicate identifiers"),
        (lambda x: x.update(allowedTargetCandidateIds=[str(i) for i in range(513)]), "between 1 and 512"),
        (lambda x: x.update(authority="CANONICAL"), "authority must be PROPOSAL_ONLY"),
        (lambda x: x.update(diagnosisContext="😀" * 16_001), "32000 UTF-16 code units"),
        (lambda x: x.update(unexpected=True), "exactly"),
    ],
)
def test_dspy_repair_request_contract_fails_closed(mutate, message):
    request = {
        "schema": "atlas.dspy-repair-request.v1",
        "contextManifestChecksum": "sha256:" + "a" * 64,
        "query": "inspect cache lookup",
        "diagnosisContext": None,
        "allowedTargetCandidateIds": ["file:cache.ts"],
        "allowedEvidenceRefs": ["src/cache.ts"],
        "authority": "PROPOSAL_ONLY",
    }
    mutate(request)
    with pytest.raises(ValueError, match=message):
        validate_dspy_repair_request_v1(request)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda x: x.update(evidenceRefs=["src/cache.ts#symbol:lookup", "invented.ts"]), "UNAUTHORIZED_EVIDENCE_REF"),
        (lambda x: x.update(targetCandidates=["function:invented"]), "UNAUTHORIZED_TARGET_ID"),
        (lambda x: x.update(contextManifestChecksum="sha256:" + "b" * 64), "CONTEXT_MANIFEST_CHECKSUM_MISMATCH"),
        (lambda x: x.update(unexpected="not allowed"), "exactly"),
        (lambda x: x.update(evidenceRefs=["tests/cache.test.ts", "tests/cache.test.ts"]), "duplicate identifiers"),
    ],
)
def test_dspy_repair_output_rejects_fabricated_or_unbound_refs(mutate, message):
    digest = "sha256:" + "a" * 64
    output = deepcopy(_repair_output())
    mutate(output)
    with pytest.raises(ValueError, match=message):
        validate_dspy_repair_output_v1(
            output,
            context_manifest_checksum=digest,
            allowed_evidence_refs=["src/cache.ts#symbol:lookup", "tests/cache.test.ts"],
            allowed_target_ids=["function:cache.lookup", "file:src/cache.ts"],
        )


def test_atlas_repair_score_v1_perfect_receipt():
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            retrieval_recall_at_5=1.0,
            localization_recall_at_5=1.0,
            exact_evidence_coverage=1.0,
            targeted_tests_passed=True,
            typecheck_passed=True,
            regression_free=True,
            patch_minimality=1.0,
            false_edit_rate=0.0,
            latency_budget_score=1.0,
            cache_reuse_rate=1.0,
        )
    )
    assert score == 1.0
    assert feedback == "All hard repair gates passed."


def test_atlas_repair_score_v1_failure_feedback():
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            retrieval_recall_at_5=0.7,
            localization_recall_at_5=0.4,
            exact_evidence_coverage=0.5,
            targeted_tests_passed=False,
            typecheck_passed=False,
            regression_free=True,
            patch_minimality=0.8,
            false_edit_rate=0.2,
            latency_budget_score=0.5,
            cache_reuse_rate=0.5,
        )
    )
    assert score < 0.7
    assert "TARGETED_TEST_FAILURE" in feedback
    assert "TYPECHECK_FAILURE" in feedback
    assert score == 0.0


@pytest.mark.parametrize(
    "failure",
    ["FABRICATED_EVIDENCE", "PERMISSION_VIOLATION", "UNSAFE_MUTATION"],
)
def test_atlas_repair_score_v1_hard_safety_failures_are_zero(failure):
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            retrieval_recall_at_5=1.0,
            localization_recall_at_5=1.0,
            exact_evidence_coverage=1.0,
            targeted_tests_passed=True,
            typecheck_passed=True,
            regression_free=True,
            patch_minimality=1.0,
            false_edit_rate=0.0,
            latency_budget_score=1.0,
            cache_reuse_rate=1.0,
            hard_gate_failures=(failure,),
        )
    )
    assert score == 0.0
    assert failure in feedback


def test_atlas_repair_score_v1_rejects_unknown_hard_gate_codes():
    observation = RepairMetricObservationV1(
        retrieval_recall_at_5=1.0,
        localization_recall_at_5=1.0,
        exact_evidence_coverage=1.0,
        targeted_tests_passed=True,
        typecheck_passed=True,
        regression_free=True,
        patch_minimality=1.0,
        false_edit_rate=0.0,
        latency_budget_score=1.0,
        cache_reuse_rate=1.0,
        hard_gate_failures=("MODEL_SAYS_BAD",),
    )
    with pytest.raises(ValueError, match="unknown hard gate failure codes"):
        atlas_repair_score_v1(observation)


def test_compare_baseline_and_optimized_v1_requires_real_lift():
    receipt = compare_baseline_and_optimized_v1([0.4, 0.6], [0.7, 0.8])
    assert receipt["baseline_mean"] == 0.5
    assert receipt["optimized_mean"] == 0.75
    assert receipt["absolute_lift"] == 0.25
    assert receipt["improved"] is True


def test_build_repair_metric_observation_from_receipt_v1_camel_case():
    receipt = {
        "retrievalRecallAt5": 0.9,
        "localizationRecallAt5": 0.85,
        "exactEvidenceCoverage": 0.95,
        "targetedTestsPassed": True,
        "typecheckPassed": True,
        "regressionFree": True,
        "patchMinimality": 0.8,
        "falseEditRate": 0.05,
        "latencyBudgetScore": 0.9,
        "cacheReuseRate": 0.75,
        "hardGateFailures": [],
    }
    obs = build_repair_metric_observation_from_receipt_v1(receipt)
    assert obs.retrieval_recall_at_5 == 0.9
    assert obs.localization_recall_at_5 == 0.85
    assert obs.exact_evidence_coverage == 0.95
    assert obs.targeted_tests_passed is True
    assert obs.typecheck_passed is True
    assert obs.regression_free is True
    assert obs.patch_minimality == 0.8
    assert obs.false_edit_rate == 0.05
    assert obs.latency_budget_score == 0.9
    assert obs.cache_reuse_rate == 0.75
    score, feedback = atlas_repair_score_v1(obs)
    assert score > 0.85
    assert feedback == "All hard repair gates passed."


def test_build_repair_metric_observation_from_receipt_v1_fails_closed():
    incomplete = {
        "retrievalRecallAt5": 0.9,
        "localizationRecallAt5": 0.85,
    }
    with pytest.raises(ValueError, match="missing required metric field"):
        build_repair_metric_observation_from_receipt_v1(incomplete)

    out_of_bounds = {
        "retrievalRecallAt5": 1.5,
        "localizationRecallAt5": 0.85,
        "exactEvidenceCoverage": 0.95,
        "targetedTestsPassed": True,
        "typecheckPassed": True,
        "regressionFree": True,
        "patchMinimality": 0.8,
        "falseEditRate": 0.05,
        "latencyBudgetScore": 0.9,
        "cacheReuseRate": 0.75,
    }
    with pytest.raises(ValueError, match="between 0.0 and 1.0"):
        build_repair_metric_observation_from_receipt_v1(out_of_bounds)


def test_repair_metric_cache_key_v1():
    key1 = build_repair_metric_cache_key_v1(
        eval_example_revision="sha256:example1111111111111111111111111111111111111111111111111111111111",
        program_revision="sha256:program2222222222222222222222222222222222222222222222222222222222",
        model_revision="ornith-1.5-9b",
        receipt_hash="sha256:receipt3333333333333333333333333333333333333333333333333333333333",
    )
    assert key1.startswith("atlas:repair-metric:v1:")
    assert len(key1) == len("atlas:repair-metric:v1:") + 64

    # Parity with identical TypeScript key
    cached = CachedRepairMetricResultV1(
        cache_key=key1,
        score=0.92,
        feedback="All hard repair gates passed.",
        eval_example_revision="sha256:example1111111111111111111111111111111111111111111111111111111111",
        program_revision="sha256:program2222222222222222222222222222222222222222222222222222222222",
        model_revision="ornith-1.5-9b",
        receipt_hash="sha256:receipt3333333333333333333333333333333333333333333333333333333333",
    )
    assert can_reuse_repair_metric_result_v1(
        eval_example_revision="sha256:example1111111111111111111111111111111111111111111111111111111111",
        program_revision="sha256:program2222222222222222222222222222222222222222222222222222222222",
        model_revision="ornith-1.5-9b",
        receipt_hash="sha256:receipt3333333333333333333333333333333333333333333333333333333333",
        cached=cached,
    ) is True

    # Mutated program revision cannot reuse
    assert can_reuse_repair_metric_result_v1(
        eval_example_revision="sha256:example1111111111111111111111111111111111111111111111111111111111",
        program_revision="sha256:program_other",
        model_revision="ornith-1.5-9b",
        receipt_hash="sha256:receipt3333333333333333333333333333333333333333333333333333333333",
        cached=cached,
    ) is False


# --- DSPy repair worker (proposal-only RPC boundary) -------------------------------------------

from types import SimpleNamespace  # noqa: E402
import json as _json  # noqa: E402
import threading  # noqa: E402
import http.client  # noqa: E402
from http.server import HTTPServer  # noqa: E402

from python.parent_atlas_dspy_repair import (  # noqa: E402
    make_repair_worker_handler_v1,
    run_repair_request_v1,
    serve_repair_worker_v1,
)

_CHECKSUM = "sha256:" + "a" * 64


def _repair_request(**overrides):
    request = {
        "schema": "atlas.dspy-repair-request.v1",
        "contextManifestChecksum": _CHECKSUM,
        "query": "why does the retrieval test fail",
        "diagnosisContext": None,
        "allowedTargetCandidateIds": ["function:example.run"],
        "allowedEvidenceRefs": ["src/example.ts#symbol:run"],
        "authority": "PROPOSAL_ONLY",
    }
    request.update(overrides)
    return request


class _FakeProgram:
    def __init__(self, targets, refs):
        self.targets = targets
        self.refs = refs
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            diagnosis="diagnosis text",
            target_candidates=_json.dumps(self.targets),
            evidence_refs=_json.dumps(self.refs),
            patch_plan="smallest patch",
            validation_plan="pytest -q",
        )


def test_repair_worker_returns_validated_proposal_and_passes_only_identifiers():
    program = _FakeProgram(["function:example.run"], ["src/example.ts#symbol:run"])
    output = run_repair_request_v1(_repair_request(), program)
    assert output["schema"] == "atlas.dspy-repair-output.v1"
    assert output["contextManifestChecksum"] == _CHECKSUM
    assert output["targetCandidates"] == ["function:example.run"]
    assert output["evidenceRefs"] == ["src/example.ts#symbol:run"]
    assert set(program.calls[0]) == {"failure", "context_manifest", "constraints"}


@pytest.mark.parametrize(
    ("targets", "refs", "message"),
    [
        (["function:invented"], ["src/example.ts#symbol:run"], "target"),
        (["function:example.run"], ["src/invented.ts"], "evidence"),
        ([], ["src/example.ts#symbol:run"], "target"),
    ],
)
def test_repair_worker_rejects_refs_outside_the_allowlist(targets, refs, message):
    with pytest.raises(ValueError):
        run_repair_request_v1(_repair_request(), _FakeProgram(targets, refs))


def test_repair_worker_rejects_non_json_program_fields():
    class _Broken:
        def __call__(self, **kwargs):
            return SimpleNamespace(
                diagnosis="d",
                target_candidates="function:example.run",
                evidence_refs="src/example.ts#symbol:run",
                patch_plan="p",
                validation_plan="v",
            )

    with pytest.raises(ValueError, match="JSON array"):
        run_repair_request_v1(_repair_request(), _Broken())


def test_repair_worker_rejects_unbounded_request_fields():
    with pytest.raises(ValueError):
        run_repair_request_v1(_repair_request(authority="APPLY"), _FakeProgram(["function:example.run"], ["src/example.ts#symbol:run"]))


def test_repair_worker_refuses_non_loopback_bind():
    with pytest.raises(ValueError, match="loopback"):
        serve_repair_worker_v1(_FakeProgram([], []), host="0.0.0.0", port=0)


def test_repair_worker_http_round_trip_on_loopback():
    program = _FakeProgram(["function:example.run"], ["src/example.ts#symbol:run"])
    server = HTTPServer(("127.0.0.1", 0), make_repair_worker_handler_v1(program))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]

        def call(method, path, body=None):
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            payload = None if body is None else _json.dumps(body).encode("utf-8")
            headers = {"Content-Type": "application/json"} if payload is not None else {}
            conn.request(method, path, body=payload, headers=headers)
            response = conn.getresponse()
            data = _json.loads(response.read().decode("utf-8"))
            conn.close()
            return response.status, data

        assert call("GET", "/health")[0] == 200
        status, data = call("POST", "/v1/repair", _repair_request())
        assert status == 200 and data["targetCandidates"] == ["function:example.run"]
        status, data = call("POST", "/v1/repair", _repair_request(allowedEvidenceRefs=["src/other.ts"]))
        assert status == 422 and data["error"] == "VALIDATION_FAILED"
        assert call("GET", "/nope")[0] == 404
        assert call("POST", "/v1/nope", _repair_request())[0] == 404
    finally:
        server.shutdown()
        server.server_close()



def test_coerce_and_validate_dspy_prediction_v1_success():
    checksum = "sha256:" + "a" * 64
    pred = {
        "diagnosis": "Type error in symbol run",
        "target_candidates": ["function:example.run"],
        "patch_plan": "Fix argument type in run()",
        "validation_plan": "npm test",
        "evidence_refs": ["src/example.ts#symbol:run"],
    }
    validated = coerce_and_validate_dspy_prediction_v1(
        pred,
        context_manifest_checksum=checksum,
        allowed_evidence_refs=["src/example.ts#symbol:run"],
        allowed_target_ids=["function:example.run"],
    )
    assert validated["schema"] == "atlas.dspy-repair-output.v1"
    assert validated["contextManifestChecksum"] == checksum
    assert validated["targetCandidates"] == ["function:example.run"]
    assert validated["evidenceRefs"] == ["src/example.ts#symbol:run"]


def test_coerce_and_validate_dspy_prediction_v1_parses_json_strings():
    checksum = "sha256:" + "b" * 64
    pred = {
        "diagnosis": "Missing export",
        "targetCandidates": '["function:example.run"]',
        "patchPlan": "Add export keyword",
        "validationPlan": "npm run check",
        "evidenceRefs": '["src/example.ts#symbol:run"]',
    }
    validated = coerce_and_validate_dspy_prediction_v1(
        pred,
        context_manifest_checksum=checksum,
        allowed_evidence_refs=["src/example.ts#symbol:run"],
        allowed_target_ids=["function:example.run"],
    )
    assert validated["targetCandidates"] == ["function:example.run"]
    assert validated["evidenceRefs"] == ["src/example.ts#symbol:run"]


def test_build_program_inputs_from_request_v1_deterministic():
    req = _repair_request()
    inputs = build_program_inputs_from_request_v1(req)
    assert "failure" in inputs
    assert "context_manifest" in inputs
    assert "constraints" in inputs
    assert req["query"] in inputs["failure"]
    assert req["contextManifestChecksum"] in inputs["context_manifest"]


def test_build_gepa_repair_metric_v1_hard_gate_failure():
    checksum = "sha256:" + "c" * 64
    gold = {
        "context_manifest_checksum": checksum,
        "allowed_evidence_refs": ["src/example.ts"],
        "allowed_target_ids": ["function:example.run"],
    }
    # Violates boundary by citing unauthorized evidence ref
    bad_pred = {
        "diagnosis": "Bad citation",
        "target_candidates": ["function:example.run"],
        "patch_plan": "Fix code",
        "validation_plan": "npm test",
        "evidence_refs": ["src/unauthorized.ts"],
    }
    metric = build_gepa_repair_metric_v1(lambda g, p: {})
    res = metric(gold, bad_pred)
    score = getattr(res, "score", res.get("score"))
    feedback = getattr(res, "feedback", res.get("feedback"))
    assert score == 0.0
    assert "BOUNDARY_CONTRACT_VIOLATION" in feedback


def test_build_gepa_repair_metric_v1_evaluated_receipt():
    checksum = "sha256:" + "d" * 64
    gold = {
        "context_manifest_checksum": checksum,
        "allowed_evidence_refs": ["src/example.ts"],
        "allowed_target_ids": ["function:example.run"],
    }
    good_pred = {
        "diagnosis": "Proper diagnosis",
        "target_candidates": ["function:example.run"],
        "patch_plan": "Fix code",
        "validation_plan": "npm test",
        "evidence_refs": ["src/example.ts"],
    }

    def dummy_evaluator(g, p):
        return {
            "retrievalRecallAt5": 1.0,
            "localizationRecallAt5": 1.0,
            "exactEvidenceCoverage": 1.0,
            "targetedTestsPassed": True,
            "typecheckPassed": True,
            "regressionFree": True,
            "patchMinimality": 1.0,
            "falseEditRate": 0.0,
            "latencyBudgetScore": 1.0,
            "cacheReuseRate": 1.0,
            "hardGateFailures": [],
        }

    metric = build_gepa_repair_metric_v1(dummy_evaluator)
    res = metric(gold, good_pred)
    score = getattr(res, "score", res.get("score"))
    feedback = getattr(res, "feedback", res.get("feedback"))
    assert score == 1.0
    assert feedback == "All hard repair gates passed."


def test_atlas_repair_score_v1_expanded_soft_metric_feedback():
    obs = RepairMetricObservationV1(
        retrieval_recall_at_5=0.5,
        localization_recall_at_5=0.5,
        exact_evidence_coverage=0.5,
        targeted_tests_passed=True,
        typecheck_passed=True,
        regression_free=True,
        patch_minimality=0.4,
        false_edit_rate=0.3,
        latency_budget_score=1.0,
        cache_reuse_rate=1.0,
    )
    score, feedback = atlas_repair_score_v1(obs)
    assert score > 0.0
    assert "exact evidence coverage below 0.8" in feedback
    assert "localization recall@5 below 0.8" in feedback
    assert "retrieval recall@5 below 0.8" in feedback
    assert "false edit rate above 0.1" in feedback
    assert "patch minimality below 0.7" in feedback


def test_evaluate_baseline_repair_program_v1_empty_fails_closed():
    from python.parent_atlas_dspy_repair import evaluate_baseline_repair_program_v1
    with pytest.raises(ValueError, match="non-empty"):
        evaluate_baseline_repair_program_v1(lambda **kw: None, [])


def test_evaluate_baseline_repair_program_v1_computes_receipt_and_metrics():
    from python.parent_atlas_dspy_repair import evaluate_baseline_repair_program_v1
    from types import SimpleNamespace

    checksum = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

    def mock_program(**kwargs):
        return SimpleNamespace(
            diagnosis="Found null pointer in feature extractor",
            target_candidates=["packet::target1"],
            evidence_refs=["file:///src/feature.ts#line10"],
            patch_plan="add null check",
            validation_plan="npm test",
        )

    examples = [
        {
            "example_id": "val-001",
            "query_text": "Null pointer in feature extractor",
            "allowed_targets": ["packet::target1", "packet::target2"],
            "allowed_evidence_refs": ["file:///src/feature.ts#line10"],
            "expected_targets": ["packet::target1"],
            "expected_evidence_refs": ["file:///src/feature.ts#line10"],
            "manifest_checksum": checksum,
        },
        {
            "example_id": "val-002",
            "query_text": "Type mismatch in caller",
            "allowed_targets": ["packet::target1", "packet::target2"],
            "allowed_evidence_refs": ["file:///src/feature.ts#line10"],
            "expected_targets": ["packet::target2"],  # program predicts target1, so recall will be 0
            "expected_evidence_refs": ["file:///src/feature.ts#line10"],
            "manifest_checksum": checksum,
        },
    ]

    result = evaluate_baseline_repair_program_v1(mock_program, examples)

    assert result["schema"] == "atlas.baseline-eval-result.v1"
    assert result["example_count"] == 2
    assert result["canonical_authority"] is False
    assert result["receipt_hash"].startswith("sha256:")
    assert len(result["per_example"]) == 2
    assert result["per_example"][0]["passed"] is True
    assert result["per_example"][0]["score"] == 1.0
    assert result["per_example"][1]["score"] < 1.0
    assert result["mean_score"] > 0.0
