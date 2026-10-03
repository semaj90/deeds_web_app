from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

import atlas_summary_claim_validation_replay_v1 as replay
from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_candidate_v1 import (
    VALIDATION_CONTRACT_REVISION, build_claim_set_v1, evaluate_candidate_v1, frozen_judge, spine_revision_v1, verify_candidate_v1,
)

DOCS = Path(__file__).resolve().parents[2] / "sveltekit-frontend" / "src" / "lib" / "server" / "atlas" / "docs" / "__fixtures__"
FX = json.loads((DOCS / "summary-candidate-v1.fixture.json").read_text(encoding="utf-8"))  # sealed by TypeScript
JUDGE_FX = json.loads((DOCS / "summary-judge-input-v1.fixture.json").read_text(encoding="utf-8"))
MODEL_REV = "ornith-1.5-9b:hforf.gguf"


def collisions(keys: list[str]) -> list[tuple[str, str]]:
    low = [k.lower() for k in keys]
    return [(a, b) for i, a in enumerate(keys) for j, b in enumerate(keys) if i != j and low[j].startswith(low[i])]


def test_python_verifies_the_typescript_sealed_candidate_claim_set_and_eligibility() -> None:
    verify_candidate_v1(FX["candidate"])
    py_claims = build_claim_set_v1(FX["candidate"])
    assert py_claims == FX["claimSet"]  # same splitter, same claim checksums, same set checksum as the TypeScript builder
    body = {k: v for k, v in FX["eligibility"].items() if k != "eligibilityChecksum"}
    assert canonical_sha256_v1(body) == FX["eligibility"]["eligibilityChecksum"]


def test_candidate_id_changes_with_any_immutable_byte_and_tampering_is_detected() -> None:
    c = copy.deepcopy(FX["candidate"])
    c["summaryText"] = c["summaryText"].replace("scans.", "scans,")
    with pytest.raises(ValueError, match="SUMMARY_OUTPUT_CHECKSUM_MISMATCH"):
        verify_candidate_v1(c)
    c2 = copy.deepcopy(FX["candidate"])
    c2["chunkEvidenceRevision"] = "sha256:" + "d" * 64
    with pytest.raises(ValueError, match="CANDIDATE_ID_MISMATCH"):
        verify_candidate_v1(c2)


def test_no_contract_object_contains_a_prefix_key_pair_that_splits_python_and_typescript_ordering() -> None:
    for name in ("candidate", "claimSet", "eligibility"):
        obj = FX[name]
        assert collisions(list(obj)) == [], name
    assert collisions(list(FX["candidate"]["generationMetadata"])) == []
    assert all(collisions(list(m)) == [] for m in FX["claimSet"]["claimList"])
    assert all(collisions(list(r)) == [] for r in FX["eligibility"]["resolutions"])


def stub_db(monkeypatch) -> None:
    monkeypatch.setattr(replay, "psql_row", lambda chunk_id, revision: (_ for _ in ()).throw(AssertionError("evaluation must use its own injected reader")))


def _row() -> dict:
    return {"chunk_id": JUDGE_FX["chunkId"], "evidence_revision": JUDGE_FX["chunkEvidenceRevision"], "text": JUDGE_FX["canonicalChunkText"], "heading_path": JUDGE_FX["promptVisibleMetadata"]["headingPath"],
           "title": JUDGE_FX["promptVisibleMetadata"]["title"], "product": JUDGE_FX["promptVisibleMetadata"]["product"], "product_version": JUDGE_FX["promptVisibleMetadata"]["productVersion"]}


READER = lambda chunk_id, revision: _row()  # noqa: E731


def make_candidate() -> dict:
    """A candidate whose chunk is the VAL-06 fixture chunk and whose text is the fixture claim, sealed with the Python twin."""
    body = {**{k: v for k, v in FX["candidate"].items() if k != "candidateId"}, "chunkId": JUDGE_FX["chunkId"], "chunkEvidenceRevision": JUDGE_FX["chunkEvidenceRevision"], "summaryText": JUDGE_FX["claim"]["claimText"]}
    import hashlib
    body["outputChecksum"] = hashlib.sha256(body["summaryText"].encode("utf-8")).hexdigest()
    return {**body, "candidateId": "sc:" + canonical_sha256_v1(body)}


def live_like_judge(verdict: str):
    def judge(sealed):
        return {"status": "JUDGED", "verdict": verdict, "citedSpans": [], "unsupportedFragment": None, "judgeModelId": "ornith-1.5-9b", "judgeModelRevision": MODEL_REV,
                "judgePromptRevision": sealed["promptRevision"], "independenceClass": "SAME_MODEL_SEMANTIC_JUDGE"}
    return judge


def test_evaluation_threads_the_same_candidate_id_and_marks_eligible_or_not(monkeypatch) -> None:
    stub_db(monkeypatch)
    cand = make_candidate()
    ok = evaluate_candidate_v1(cand, live_like_judge("SUPPORTED"), MODEL_REV, READER)
    assert ok["eligibility"]["candidateId"] == ok["claimSet"]["candidateId"] == cand["candidateId"]
    assert ok["eligibility"]["eligible"] is True and ok["eligibility"]["claimSetChecksum"] == ok["claimSet"]["claimSetChecksum"]
    assert ok["eligibility"]["validationContractRevision"] == VALIDATION_CONTRACT_REVISION and ok["eligibility"]["spineRevision"] == spine_revision_v1()
    bad = evaluate_candidate_v1(cand, live_like_judge("UNSUPPORTED_CLAIM"), MODEL_REV, READER)
    assert bad["eligibility"]["eligible"] is False and bad["eligibility"]["resolutions"][0]["decision"] == "REJECT"


def test_frozen_replay_reproduces_every_checksum_with_no_model_call(monkeypatch) -> None:
    stub_db(monkeypatch)
    cand = make_candidate()
    first = evaluate_candidate_v1(cand, live_like_judge("SUPPORTED"), MODEL_REV, READER)
    lineage = {r["validationId"]: r["judgeInputChecksum"] for r in first["eligibility"]["resolutions"]}
    again = evaluate_candidate_v1(cand, frozen_judge(first["validations"], lineage), MODEL_REV, READER)  # frozen_judge cannot reach a model
    assert again["claimSet"] == first["claimSet"]
    assert [v["validationChecksum"] for v in again["validations"]] == [v["validationChecksum"] for v in first["validations"]]
    assert again["eligibility"] == first["eligibility"]


def test_frozen_replay_reports_deterministic_drift_instead_of_rejudging(monkeypatch) -> None:
    stub_db(monkeypatch)
    cand = make_candidate()
    first = evaluate_candidate_v1(cand, live_like_judge("SUPPORTED"), MODEL_REV, READER)
    with pytest.raises(LookupError, match="FROZEN_JUDGE_INPUT_NOT_FOUND"):
        evaluate_candidate_v1(cand, frozen_judge(first["validations"], {v["validationId"]: "0" * 64 for v in first["validations"]}), MODEL_REV, READER)
