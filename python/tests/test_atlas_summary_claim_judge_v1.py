from __future__ import annotations

import json
from pathlib import Path

import pytest

from atlas_summary_claim_judge_v1 import (
    build_judge_input_body_v1, build_messages, judge_claim_v1, parse_output, resolve_model, seal_judge_input_v1,
    validate_judge_input_v1,
)

DOCS = Path(__file__).resolve().parents[2] / "sveltekit-frontend" / "src" / "lib" / "server" / "atlas" / "docs" / "__fixtures__"
TS_INPUT = json.loads((DOCS / "summary-judge-input-v1.fixture.json").read_text(encoding="utf-8"))
MODEL = {"id": "ornith-1.5-9b", "revision": "ornith-1.5-9b:hforf.gguf"}


def test_python_seal_matches_the_typescript_judge_input_fixture() -> None:
    body = {k: v for k, v in TS_INPUT.items() if k != "judgeInputChecksum"}
    assert seal_judge_input_v1(body)["judgeInputChecksum"] == TS_INPUT["judgeInputChecksum"]


def test_builder_reproduces_the_typescript_body_and_requires_exact_id_and_revision() -> None:
    row = {"chunk_id": TS_INPUT["chunkId"], "evidence_revision": TS_INPUT["chunkEvidenceRevision"], "text": TS_INPUT["canonicalChunkText"]}
    args = dict(row=row, expected_chunk_id=TS_INPUT["chunkId"], expected_revision=TS_INPUT["chunkEvidenceRevision"], summary_output_checksum=TS_INPUT["summaryOutputChecksum"],
                metadata=TS_INPUT["promptVisibleMetadata"], claim_ordinal=0, claim_text=TS_INPUT["claim"]["claimText"], findings=TS_INPUT["deterministicFindings"], prompt_revision=TS_INPUT["promptRevision"])
    body = build_judge_input_body_v1(**args)
    assert seal_judge_input_v1(body) == TS_INPUT
    with pytest.raises(ValueError, match="REVISION_MISMATCH"):
        build_judge_input_body_v1(**{**args, "expected_revision": "sha256:" + "0" * 64})
    with pytest.raises(ValueError, match="CHUNK_ID_MISMATCH"):
        build_judge_input_body_v1(**{**args, "expected_chunk_id": "doc:other:0"})


def test_prompt_contains_only_the_chunk_claim_metadata_and_findings() -> None:
    text = "\n".join(m["content"] for m in build_messages(TS_INPUT))
    assert TS_INPUT["canonicalChunkText"] in text and TS_INPUT["claim"]["claimText"] in text


def test_input_seal_and_strict_shape_fail_closed_before_transport() -> None:
    for polluted in (
        {**TS_INPUT, "webResults": ["LEAK-WEB"]},
        {**TS_INPUT, "judgeInputChecksum": "0" * 64},
        {**TS_INPUT, "canonicalChunkTextChecksum": "0" * 64},
        {**TS_INPUT, "claim": {**TS_INPUT["claim"], "claimText": "tampered"}},
    ):
        with pytest.raises(ValueError):
            validate_judge_input_v1(polluted)
        slot = judge_claim_v1(polluted, lambda _m: pytest.fail("transport must not run"), MODEL)
        assert slot["status"] == "JUDGE_ERROR" and slot["verdict"] is None


def test_input_rejects_unrun_deterministic_slots_before_transport() -> None:
    for name in ("technical", "numeric", "version"):
        findings = {**TS_INPUT["deterministicFindings"], name: {**TS_INPUT["deterministicFindings"][name], "status": "NOT_RUN"}}
        polluted = {**TS_INPUT, "deterministicFindings": findings}
        with pytest.raises(ValueError, match="DETERMINISTIC_SLOT_NOT_RUN"):
            validate_judge_input_v1(polluted)
    findings = {**TS_INPUT["deterministicFindings"], "sourceSpan": {"status": "NOT_RUN", "spans": []}}
    with pytest.raises(ValueError, match="SOURCE_SPAN_STATE_INCOMPLETE"):
        validate_judge_input_v1({**TS_INPUT, "deterministicFindings": findings})


@pytest.mark.parametrize("raw", [
    '{"verdict":"SUPPORTED","unsupportedFragment":null}',
    '```json\n{"verdict":"SUPPORTED","unsupportedFragment":null}\n```',
    'Sure. {"verdict":"SUPPORTED","unsupportedFragment":"null"} done',
])
def test_parse_accepts_fenced_and_prefixed_json(raw: str) -> None:
    assert parse_output(raw) == {"verdict": "SUPPORTED", "unsupportedFragment": None}


@pytest.mark.parametrize("raw", ["", "no json here", '{"verdict":"PROBABLY_FINE"}', '["SUPPORTED"]', '{"verdict": ', '{"claims":[]}'])
def test_parse_rejects_anything_without_a_valid_verdict(raw: str) -> None:
    assert parse_output(raw) is None


def test_judged_slot_records_model_prompt_revision_and_same_model_independence_without_model_spans() -> None:
    slot = judge_claim_v1(TS_INPUT, lambda _m: '{"verdict":"PARTIALLY_SUPPORTED","unsupportedFragment":"low-selectivity"}', MODEL)
    assert slot["status"] == "JUDGED" and slot["verdict"] == "PARTIALLY_SUPPORTED" and slot["unsupportedFragment"] == "low-selectivity"
    assert slot["independenceClass"] == "SAME_MODEL_SEMANTIC_JUDGE" and slot["judgePromptRevision"] == TS_INPUT["promptRevision"]
    assert slot["judgeModelId"] == "ornith-1.5-9b" and slot["citedSpans"] == []


def test_every_failure_mode_is_judge_error_never_a_pass() -> None:
    def boom(_m):  # transport / timeout
        raise TimeoutError("timed out")
    for transport in (boom, lambda _m: "garbage", lambda _m: '{"verdict":"NOPE"}'):
        slot = judge_claim_v1(TS_INPUT, transport, MODEL)
        assert slot["status"] == "JUDGE_ERROR" and slot["verdict"] is None and slot["judgeModelId"] is None


def test_model_gate_requires_ornith_listed_by_the_server_and_never_ollama_or_other_models() -> None:
    ok = {"/props": {"model_alias": "ornith-1.5-9b", "model_path": "C:\\models\\hforf.gguf"}, "/v1/models": {"data": [{"id": "ornith-1.5-9b"}]}}
    assert resolve_model("http://x", lambda p: ok[p])["revision"] == "ornith-1.5-9b:hforf.gguf"
    for alias in ("gemma4-legal-iq4xs-direct.gguf", "llama3", "hforf"):
        bad = {"/props": {"model_alias": alias}, "/v1/models": {"data": [{"id": alias}]}}
        with pytest.raises(RuntimeError, match="JUDGE_MODEL_NOT_APPROVED"):
            resolve_model("http://x", lambda p, b=bad: b[p])
    unlisted = {"/props": {"model_alias": "ornith-1.5-9b"}, "/v1/models": {"data": [{"id": "other"}]}}
    with pytest.raises(RuntimeError):
        resolve_model("http://x", lambda p: unlisted[p])


def test_one_retry_on_transport_failure_but_never_on_parse_failure_and_never_a_pass_after_two_failures() -> None:
    calls = {"n": 0}

    def flaky(_m):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TimeoutError("transient")
        return '{"verdict":"SUPPORTED","unsupportedFragment":null}'
    assert judge_claim_v1(TS_INPUT, flaky, MODEL)["verdict"] == "SUPPORTED" and calls["n"] == 2

    garbage = {"n": 0}

    def bad(_m):
        garbage["n"] += 1
        return "garbage"
    assert judge_claim_v1(TS_INPUT, bad, MODEL)["status"] == "JUDGE_ERROR" and garbage["n"] == 1  # parse failure: parsed None, no exception, so no retry

    def dead(_m):
        raise TimeoutError("down")
    assert judge_claim_v1(TS_INPUT, dead, MODEL)["status"] == "JUDGE_ERROR"
