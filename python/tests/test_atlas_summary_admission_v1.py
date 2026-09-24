from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import atlas_summary_claim_judge_replay_v1 as judge_replay
import atlas_summary_claim_validation_replay_v1 as replay
from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_admission_v1 import ADMISSION_SCHEMA, admit_summary_v1

DOCS = Path(__file__).resolve().parents[2] / "sveltekit-frontend" / "src" / "lib" / "server" / "atlas" / "docs" / "__fixtures__"
TS = json.loads((DOCS / "summary-judge-input-v1.fixture.json").read_text(encoding="utf-8"))
MODEL = {"id": "ornith-1.5-9b", "revision": "ornith-1.5-9b:hforf.gguf"}
ROW = {"chunk_id": TS["chunkId"], "evidence_revision": TS["chunkEvidenceRevision"], "text": TS["canonicalChunkText"], "heading_path": TS["promptVisibleMetadata"]["headingPath"],
       "title": TS["promptVisibleMetadata"]["title"], "product": TS["promptVisibleMetadata"]["product"], "product_version": TS["promptVisibleMetadata"]["productVersion"]}
CLAIM = TS["claim"]["claimText"]
INPUT_CHECKSUM = "d" * 64


def stub_db(monkeypatch) -> None:
    monkeypatch.setattr(replay, "psql_row", lambda chunk_id, revision: ROW if (chunk_id, revision) == (TS["chunkId"], TS["chunkEvidenceRevision"]) else (_ for _ in ()).throw(RuntimeError("CHUNK_NOT_FOUND_AT_REVISION")))


def judge(verdict: str):
    return lambda _m: json.dumps({"verdict": verdict, "unsupportedFragment": None})


def test_all_claims_admit_makes_the_summary_eligible_and_binds_exact_text_and_revisions(monkeypatch) -> None:
    stub_db(monkeypatch)
    r = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, CLAIM, judge("SUPPORTED"), MODEL)
    assert r["schema"] == ADMISSION_SCHEMA and r["wholeSummaryEligible"] is True and r["claimCount"] == 1 and r["claims"][0]["decision"] == "ADMIT"
    assert r["summaryInputChecksum"] == INPUT_CHECKSUM
    assert r["summaryOutputSha256"] == hashlib.sha256(CLAIM.encode("utf-8")).hexdigest() and r["canonicalAuthority"] is False
    body = {k: v for k, v in r.items() if k != "admissionChecksum"}
    assert r["admissionChecksum"] == canonical_sha256_v1(body)


def test_a_single_non_admit_claim_makes_the_whole_summary_ineligible(monkeypatch) -> None:
    stub_db(monkeypatch)
    for verdict in ("UNSUPPORTED_CLAIM", "PARTIALLY_SUPPORTED", "UNKNOWN"):
        r = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, CLAIM, judge(verdict), MODEL)
        assert r["wholeSummaryEligible"] is False and r["claims"][0]["decision"] in ("REJECT", "REVIEW")


def test_judge_failure_is_review_never_eligible(monkeypatch) -> None:
    stub_db(monkeypatch)
    r = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, CLAIM, lambda _m: "garbage", MODEL)
    assert r["wholeSummaryEligible"] is False and r["claims"][0]["decision"] == "REVIEW"


def test_wrong_chunk_revision_fails_closed_before_any_report(monkeypatch) -> None:
    stub_db(monkeypatch)
    try:
        admit_summary_v1(TS["chunkId"], "sha256:" + "0" * 64, INPUT_CHECKSUM, CLAIM, judge("SUPPORTED"), MODEL)
    except RuntimeError as e:
        assert "CHUNK_NOT_FOUND_AT_REVISION" in str(e)
    else:
        raise AssertionError("expected fail-closed")


def test_empty_summary_has_no_claims_and_is_not_eligible(monkeypatch) -> None:
    stub_db(monkeypatch)
    r = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, "  ", judge("SUPPORTED"), MODEL)
    assert r["claimCount"] == 0 and r["wholeSummaryEligible"] is False


def test_changed_text_changes_the_bound_output_hash_and_seal(monkeypatch) -> None:
    stub_db(monkeypatch)
    a = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, CLAIM, judge("SUPPORTED"), MODEL)
    b = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, CLAIM + " ", judge("SUPPORTED"), MODEL)
    assert a["summaryOutputSha256"] != b["summaryOutputSha256"] and a["admissionChecksum"] != b["admissionChecksum"]


def test_input_checksum_is_required_and_sealed(monkeypatch) -> None:
    stub_db(monkeypatch)
    try:
        admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], "not-a-sha256", CLAIM, judge("SUPPORTED"), MODEL)
    except ValueError as e:
        assert str(e) == "SUMMARY_INPUT_CHECKSUM_INVALID"
    else:
        raise AssertionError("expected invalid input checksum to fail closed")


def test_claim_validation_lineage_uses_the_exact_writer_input_checksum(monkeypatch) -> None:
    stub_db(monkeypatch)
    lineage = {}
    resolved = replay.one_pass(
        [{"chunkId": TS["chunkId"], "chunkEvidenceRevision": TS["chunkEvidenceRevision"], "summary": CLAIM,
          "summaryInputChecksum": INPUT_CHECKSUM}],
        transport=None, model=MODEL, lineage=lineage, judge=lambda _sealed: {"status": "JUDGED", "verdict": "SUPPORTED", "citedSpans": [],
            "unsupportedFragment": None, "judgeModelId": MODEL["id"], "judgeModelRevision": MODEL["revision"],
            "judgePromptRevision": "test-prompt-v1", "independenceClass": "SAME_MODEL_SEMANTIC_JUDGE"})
    assert len(resolved) == 1 and resolved[0]["summaryInputChecksum"] == INPUT_CHECKSUM


def test_revision_readback_uses_quoted_psql_variables_in_read_only_transaction(monkeypatch) -> None:
    chunk_id = "doc:test:x'; DROP TABLE atlas_external_doc_chunks; --"
    revision = TS["chunkEvidenceRevision"]
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(stdout=json.dumps({"chunk_id": chunk_id, "evidence_revision": revision, "text": "safe"}))

    monkeypatch.setattr(judge_replay.subprocess, "run", fake_run)
    assert judge_replay.psql_row(chunk_id, revision)["text"] == "safe"
    args, kwargs = calls[0]
    sql = kwargs["input"]
    assert "WHERE c.chunk_id = :'chunk_id' AND c.evidence_revision = :'revision'" in sql
    assert "BEGIN TRANSACTION READ ONLY" in sql and "ROLLBACK" in sql
    assert chunk_id not in sql and f"chunk_id={chunk_id}" in args


def test_revision_readback_rejects_malformed_revision_before_database_call(monkeypatch) -> None:
    called = False

    def fake_run(*_args, **_kwargs):
        nonlocal called
        called = True
        return SimpleNamespace(stdout="{}")

    monkeypatch.setattr(judge_replay.subprocess, "run", fake_run)
    try:
        judge_replay.psql_row(TS["chunkId"], "workspace:0")
    except ValueError as e:
        assert str(e) == "CHUNK_ID_OR_EVIDENCE_REVISION_INVALID"
    else:
        raise AssertionError("expected malformed revision to fail closed")
    assert called is False


def test_report_keys_avoid_the_python_ts_canonical_sort_hazard(monkeypatch) -> None:
    """TypeScript sorts canonical object keys with localeCompare('en'); the Python port sorts by code point. They diverge when one key is a case-insensitive
    prefix of another (e.g. `claims` / `claimSplitterRevision`). The sealed report must never contain such a pair, or Python and TS seals silently disagree."""
    stub_db(monkeypatch)
    r = admit_summary_v1(TS["chunkId"], TS["chunkEvidenceRevision"], INPUT_CHECKSUM, CLAIM, judge("SUPPORTED"), MODEL)

    def collisions(keys: list[str]) -> list[tuple[str, str]]:
        lowered = [k.lower() for k in keys]
        return [(a, b) for i, a in enumerate(keys) for j, b in enumerate(keys) if i != j and lowered[j].startswith(lowered[i])]
    assert collisions(list(r)) == []
    assert all(collisions(list(c)) == [] for c in r["claims"])
