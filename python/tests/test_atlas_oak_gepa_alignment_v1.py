"""Fixture-level tests. Where source modules exist, also exercise actual repo contracts.

Run: py -3.13 -m pytest -q python/tests/test_atlas_oak_gepa_alignment_v1.py
"""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import json
import sys
from types import SimpleNamespace
import pytest

# Supports both a real repository root and this independently staged kit.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from python import atlas_oak_gepa_alignment_v1 as bridge

A = "sha256:" + "a" * 64
B = "sha256:" + "b" * 64
C = "sha256:" + "c" * 64


class _Obj:
    def __init__(self, **values):
        self.__dict__.update(values)

    def model_dump(self, mode="json"):
        return dict(self.__dict__)


class _FakeOakArgs:
    @classmethod
    def model_validate(cls, v):
        return v if isinstance(v, _Obj) else _Obj(**v)


class _FakeOakResult:
    @classmethod
    def model_validate(cls, v):
        if isinstance(v, _Obj):
            return v
        return _Obj(**{**v, "evidence": tuple(_Obj(**x) for x in v["evidence"])})


def _oak_build_result(**values):
    evidence = tuple(sorted(values["evidence"], key=lambda e:(e.distance, e.relation, e.factId, e.evidenceRef, e.factChecksum)))
    body = {
        "schema": "atlas.oak.failure-context.result.v1",
        "requestId": values["request_id"], "status": values["status"],
        "evidence": tuple(e.model_dump() for e in evidence),
        "ontologyRevision": values["ontology_revision"],
        "policyRevision": values["policy_revision"],
        "producerRevision": values["producer_revision"],
        "canonicalAuthority": False, "writesPerformed": False,
    }
    return _Obj(**{**body,"evidence":evidence, "resultChecksum":"sha256:"+sha256(bridge._bytes(body)).hexdigest()})


FAKE_OAK = SimpleNamespace(
    FindFailureContextArgsV1=_FakeOakArgs,
    FailureContextResultV1=_FakeOakResult,
    build_failure_context_result_v1=_oak_build_result,
)


def _request_validate(v):
    if set(v) != {"schema", "contextManifestChecksum", "query", "diagnosisContext", "allowedTargetCandidateIds", "allowedEvidenceRefs", "authority"}:
        raise ValueError("unknown request fields")
    if v["authority"] != "PROPOSAL_ONLY" or v["schema"] != "atlas.dspy-repair-request.v1":
        raise ValueError("invalid authority")
    if len(v["diagnosisContext"].encode("utf-16-le")) // 2 > 32000:
        raise ValueError("diagnosis too long")
    return dict(v)


def _output_validate(output, *, context_manifest_checksum, allowed_evidence_refs, allowed_target_ids):
    if output["contextManifestChecksum"] != context_manifest_checksum:
        raise ValueError("context mismatch")
    if not output["targetCandidates"] or not set(output["targetCandidates"]).issubset(allowed_target_ids):
        raise ValueError("unapproved targets")
    if not output["evidenceRefs"] or not set(output["evidenceRefs"]).issubset(allowed_evidence_refs):
        raise ValueError("unapproved evidence")
    return dict(output)


def _run_program(req, program):
    out = program(failure=req["query"], context_manifest=req["diagnosisContext"], constraints=json.dumps(req))
    return _output_validate({
        "schema": "atlas.dspy-repair-output.v1",
        "contextManifestChecksum": req["contextManifestChecksum"],
        "diagnosis": out.diagnosis,
        "targetCandidates": out.target_candidates,
        "patchPlan": out.patch_plan,
        "validationPlan": out.validation_plan,
        "evidenceRefs": out.evidence_refs,
    }, context_manifest_checksum=req["contextManifestChecksum"],
       allowed_evidence_refs=req["allowedEvidenceRefs"],
       allowed_target_ids=req["allowedTargetCandidateIds"])


class _FakeRepair:
    validate_dspy_repair_request_v1 = staticmethod(_request_validate)
    validate_dspy_repair_output_v1 = staticmethod(_output_validate)
    run_repair_request_v1 = staticmethod(_run_program)
    build_repair_metric_observation_from_receipt_v1 = staticmethod(lambda receipt: receipt)
    build_gepa_repair_metric_v1 = staticmethod(lambda evaluator: evaluator)


@pytest.fixture(autouse=True)
def use_safe_fake_dependencies(monkeypatch):
    monkeypatch.setattr(bridge, "_oak", lambda: FAKE_OAK)
    monkeypatch.setattr(bridge, "_repair", lambda: _FakeRepair)


def fixture():
    args = {
        "schema": "atlas.oak.find-failure-context.args.v1",
        "requestId": "req-1", "taskProfileChecksum": A,
        "admittedFactIds": ("fact-1",), "admittedFactChecksums": (B,),
        "workspaceRevision": C, "ontologyRevision": "ontology:v7",
        "policyRevision": "policy:v3", "maxNeighbors": 2, "maxHops": 2,
        "canonicalAuthority": False,
    }
    evidence = (_Obj(factId="fact-1", factChecksum=B, evidenceRef="src/a.ts#symbol:render",
                     relation="USES_SYMBOL", distance=1),)
    result = _oak_build_result(
        request_id="req-1", status="AVAILABLE", evidence=evidence,
        ontology_revision="ontology:v7", policy_revision="policy:v3", producer_revision="kernel:v2")
    return args, result


def prepare(args=None, result=None, **updates):
    a, r = fixture()
    params = dict(oak_args=args if args is not None else a, oak_result=result if result is not None else r,
                  context_manifest_checksum=A, allowed_evidence_refs=["src/a.ts#symbol:render"],
                  allowed_target_ids=["function:render"], query="Fix TS2345")
    params.update(updates)
    return bridge.prepare_oak_repair_handoff_v1(**params)


def test_prepare_and_verify_handoff():
    h = prepare()
    assert h["request"]["authority"] == "PROPOSAL_ONLY"
    assert h["request"]["allowedEvidenceRefs"] == ["src/a.ts#symbol:render"]
    assert bridge.verify_oak_repair_handoff_v1(h) == h
    assert h["canonicalAuthority"] is False and h["writesPerformed"] is False


def test_handoff_deterministic_and_tamper_rejected():
    x, y = prepare(), prepare()
    assert x == y
    y["request"]["allowedEvidenceRefs"].append("fabricated")
    with pytest.raises(ValueError, match="CHECKSUM_MISMATCH"):
        bridge.verify_oak_repair_handoff_v1(y)

@pytest.mark.parametrize("field,new_value,message", [
    ("requestId", "req-other", "REQUEST_ID_MISMATCH"),
    ("ontologyRevision", "ontology:stale", "ONTOLOGY_OR_POLICY_REVISION_MISMATCH"),
    ("policyRevision", "policy:stale", "ONTOLOGY_OR_POLICY_REVISION_MISMATCH"),
    ("resultChecksum", A, "RESULT_CHECKSUM_MISMATCH"),
    ("status", "UNAVAILABLE", "GROUNDING_UNAVAILABLE"),
])
def test_stale_or_unavailable_oak_result_rejected(field, new_value, message):
    a, r = fixture()
    r = deepcopy(r)
    setattr(r, field, new_value)
    with pytest.raises(ValueError, match=message):
        prepare(args=a, result=r)


def test_unadmitted_fact_rejected_even_if_result_resealed():
    args, r = fixture()
    modified = _Obj(factId="fact-other", factChecksum=B, evidenceRef="src/a.ts#symbol:render",
                    relation="USES_SYMBOL", distance=1)
    r = _oak_build_result(request_id=r.requestId, status=r.status, evidence=(modified,),
                          ontology_revision=r.ontologyRevision, policy_revision=r.policyRevision,
                          producer_revision=r.producerRevision)
    with pytest.raises(ValueError, match="UNADMITTED_FACT"):
        prepare(args=args, result=r)


def test_unqualified_ref_and_hop_limit_rejected():
    a, r = fixture()
    e = _Obj(**{**r.evidence[0].model_dump(), "evidenceRef":"src/other.ts"})
    r2 = _oak_build_result(request_id=r.requestId, status=r.status, evidence=(e,),
                           ontology_revision=r.ontologyRevision, policy_revision=r.policyRevision,
                           producer_revision=r.producerRevision)
    with pytest.raises(ValueError, match="UNAUTHORIZED_EVIDENCE_REF"):
        prepare(args=a, result=r2)
    e = _Obj(**{**r.evidence[0].model_dump(), "distance":3})
    r3 = _oak_build_result(request_id=r.requestId, status=r.status, evidence=(e,),
                           ontology_revision=r.ontologyRevision, policy_revision=r.policyRevision,
                           producer_revision=r.producerRevision)
    with pytest.raises(ValueError, match="HOP_LIMIT_EXCEEDED"):
        prepare(args=a, result=r3)


def test_shadow_proposal_uses_existing_repair_adapter():
    h = prepare()
    calls = []
    def program(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(diagnosis="source mismatch", target_candidates=["function:render"],
                               evidence_refs=["src/a.ts#symbol:render"], patch_plan="propose typed fix",
                               validation_plan="run unit test")
    out = bridge.run_shadow_repair_proposal_v1(h, program, program_revision="dspy:fixture:v1")
    assert len(calls) == 1
    assert out["proposal"]["targetCandidates"] == ["function:render"]
    assert out["validatorStatus"] == "NOT_RUN"
    assert out["optimizationStatus"] == "NOT_RUN"
    assert out["canonicalAuthority"] is False


def test_shadow_proposal_rejects_invented_target():
    h = prepare()
    def program(**kwargs):
        return SimpleNamespace(diagnosis="bad", target_candidates=["invented"],
                               evidence_refs=["src/a.ts#symbol:render"], patch_plan="fix", validation_plan="run")
    with pytest.raises(ValueError, match="unapproved targets"):
        bridge.run_shadow_repair_proposal_v1(h, program, program_revision="v1")


def test_gepa_requires_independently_attested_receipt():
    gold = {"contextManifestChecksum": A}
    proposal = {"contextManifestChecksum": A}
    metric = bridge.build_receipt_only_gepa_metric_v1(
        load_validator_receipt=lambda g,p: {"typecheckPassed":True},
        attest_validator_receipt=lambda g,p,r: False,
    )
    with pytest.raises(ValueError, match="UNTRUSTED"):
        metric(gold,proposal)
    metric_missing = bridge.build_receipt_only_gepa_metric_v1(
        load_validator_receipt=lambda g,p: None,
        attest_validator_receipt=lambda g,p,r: True,
    )
    with pytest.raises(ValueError, match="RECEIPT_MISSING"):
        metric_missing(gold,proposal)


def test_gepa_receipt_success_is_only_external_attestation():
    metric = bridge.build_receipt_only_gepa_metric_v1(
        load_validator_receipt=lambda g,p: {"targetedTestsPassed":True},
        attest_validator_receipt=lambda g,p,r: r["targetedTestsPassed"] is True,
    )
    assert metric({"contextManifestChecksum":A},{"contextManifestChecksum":A}) == {"targetedTestsPassed":True}


def test_frozen_corpus_disallows_source_leakage_and_duplicate_examples():
    def row(e,s,split):
        return {"exampleId":e,"sourceRef":s,"sourceRevision":B,"workspaceRevision":C,"split":split}
    rows = [row("1","a.ts","train"), row("2","b.ts","validation"), row("3","c.ts","heldout")]
    proof = bridge.check_frozen_gepa_splits_v1(rows)
    assert proof["status"] == "METADATA_VALID_ONLY"
    assert proof["counts"] == {"train":1,"validation":1,"heldout":1}
    with pytest.raises(ValueError, match="SOURCE_LEAKAGE"):
        bridge.check_frozen_gepa_splits_v1(rows + [row("4","a.ts","heldout")])
    with pytest.raises(ValueError, match="DUPLICATE_EXAMPLE"):
        bridge.check_frozen_gepa_splits_v1(rows + [row("1","d.ts","train")])


def test_missing_corpus_partition_fails():
    with pytest.raises(ValueError, match="MISSING_PARTITION"):
        bridge.check_frozen_gepa_splits_v1([
            {"exampleId":"1","sourceRef":"a","sourceRevision":B,"workspaceRevision":C,"split":"train"},
            {"exampleId":"2","sourceRef":"b","sourceRevision":B,"workspaceRevision":C,"split":"validation"}
        ])


def test_real_repo_contracts_if_available(monkeypatch):
    """Unlike fixture tests, runs the actual existing OaK/Pydantic + DSPy adapters.

    Skips only when the source modules are not present in this independent ZIP.
    In Parent Atlas's worktree this test MUST run (not skip).
    """
    try:
        from python.oak_agent import structured_contracts_v1 as actual_oak
        from python import parent_atlas_dspy_repair as actual_repair
    except ModuleNotFoundError:
        pytest.skip("Actual Parent Atlas source modules are not bundled in ZIP")
    monkeypatch.setattr(bridge, "_oak", lambda: actual_oak)
    monkeypatch.setattr(bridge, "_repair", lambda: actual_repair)
    args = actual_oak.FindFailureContextArgsV1(
        requestId="fixture:req:1", taskProfileChecksum=A,
        admittedFactIds=("fact:1",), admittedFactChecksums=(B,),
        workspaceRevision=C, ontologyRevision="ontology:fixture:v1",
        policyRevision="policy:fixture:v1", maxNeighbors=4, maxHops=2,
        canonicalAuthority=False,
    )
    evidence = actual_oak.FailureContextEvidenceV1(
        factId="fact:1", factChecksum=B, evidenceRef="src/a.ts#symbol:render",
        relation="USES_SYMBOL", distance=1,
    )
    result = actual_oak.build_failure_context_result_v1(
        request_id=args.requestId, status="AVAILABLE", evidence=(evidence,),
        ontology_revision=args.ontologyRevision, policy_revision=args.policyRevision,
        producer_revision="oak-fixture:v1",
    )
    handoff = bridge.prepare_oak_repair_handoff_v1(
        oak_args=args, oak_result=result, context_manifest_checksum=A,
        allowed_evidence_refs=["src/a.ts#symbol:render"],
        allowed_target_ids=["function:render"], query="Test fixture TS2345",
    )
    assert bridge.verify_oak_repair_handoff_v1(handoff)["handoffChecksum"].startswith("sha256:")
    def program(**kwargs):
        return SimpleNamespace(
            diagnosis="fixture diagnosis", target_candidates=json.dumps(["function:render"]),
            evidence_refs=json.dumps(["src/a.ts#symbol:render"]),
            patch_plan="fixture plan only", validation_plan="fixture command only",
        )
    proposal = bridge.run_shadow_repair_proposal_v1(handoff, program, program_revision="program:fixture")
    assert proposal["proposal"]["schema"] == "atlas.dspy-repair-output.v1"
    assert proposal["validatorStatus"] == "NOT_RUN"
    # This test intentionally does not call GEPA or any live model.


def test_proposal_receipt_readback_and_tamper():
    h = prepare()
    def program(**kwargs):
        return SimpleNamespace(diagnosis="evidence-backed", target_candidates=["function:render"],
                               evidence_refs=["src/a.ts#symbol:render"], patch_plan="no mutation",
                               validation_plan="independent tests required")
    receipt = bridge.run_shadow_repair_proposal_v1(h, program, program_revision="program:fixture:v1")
    assert bridge.verify_shadow_repair_proposal_v1(receipt, handoff=h) == receipt
    broken = deepcopy(receipt)
    broken["proposal"]["patchPlan"] = "different plan"
    with pytest.raises(ValueError, match="CHECKSUM_MISMATCH"):
        bridge.verify_shadow_repair_proposal_v1(broken, handoff=h)
    broken = deepcopy(receipt)
    broken["validatorStatus"] = "PASSED"
    with pytest.raises(ValueError, match="UNPROVEN_EXECUTION"):
        bridge.verify_shadow_repair_proposal_v1(broken, handoff=h)
