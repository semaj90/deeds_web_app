"""VAL-07: bounded same-model semantic judge for ONE claim against ONE canonical chunk (Ornith on llama-server :8090, NOT Ollama).

Input is the VAL-06 SummaryJudgeInputV1 (exact chunk + one claim + deterministic findings + explicit prompt revision) and nothing else.
Output is the VAL-01 `semantic` slot only. The judge never decides ADMIT/REVIEW/REJECT (VAL-09) and never overrides a deterministic
failure: a FAIL finding is shown to the judge but the slot just records what it said. Any transport, model-gate or parse problem is
recorded as JUDGE_ERROR (null verdict), never as a pass. The judge does not cite byte offsets: model-made offsets are never trusted,
so `citedSpans` stays empty and VAL-05 remains the only span authority. independenceClass is always SAME_MODEL_SEMANTIC_JUDGE.
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Any, Callable, Optional

from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_claim_validation_v1 import SemanticSlot, claim_checksum_v1

PROMPT_REVISION = "summary-claim-judge-prompt:val-07-v1"
VERDICTS = ("SUPPORTED", "SUPPORTED_PARAPHRASE", "SUPPORTED_WITH_OMISSION", "PARTIALLY_SUPPORTED", "UNSUPPORTED_CLAIM", "CONTRADICTED", "INSUFFICIENT_EVIDENCE", "UNKNOWN")
_ORNITH = re.compile(r"^ornith-1[._-]?5", re.I)
SYSTEM_PROMPT = (
    "You check ONE claim against ONE documentation chunk. Use only the chunk text given; do not use outside knowledge. Choose exactly one verdict: "
    + ", ".join(VERDICTS) + ". SUPPORTED = the chunk states it; SUPPORTED_PARAPHRASE = same meaning in different words; SUPPORTED_WITH_OMISSION = supported but leaves out "
    "something material; PARTIALLY_SUPPORTED = only part is stated; UNSUPPORTED_CLAIM = the chunk does not say it; CONTRADICTED = the chunk says the opposite; "
    "INSUFFICIENT_EVIDENCE = the chunk is too thin to tell; UNKNOWN = cannot decide. Deterministic findings are shown for context and are facts you cannot overturn. "
    'Reply with JSON only: {"verdict":"<one verdict>","unsupportedFragment":"<the unsupported words, or null>"}'
)

Transport = Callable[[list[dict[str, str]]], str]


def validate_judge_input_v1(judge_input: dict[str, Any]) -> None:
    """Fail closed on anything other than the sealed, strict VAL-06 wire shape."""
    required = {
        "schema", "chunkId", "chunkEvidenceRevision", "summaryOutputChecksum", "canonicalChunkText", "canonicalChunkTextChecksum",
        "promptVisibleMetadata", "claim", "deterministicFindings", "promptRevision", "canonicalAuthority", "judgeInputChecksum",
    }
    if not isinstance(judge_input, dict) or set(judge_input) != required:
        raise ValueError("JUDGE_INPUT_FIELDS_MISMATCH")
    if judge_input["schema"] != "atlas.summary-judge-input.v1" or judge_input["canonicalAuthority"] is not False:
        raise ValueError("JUDGE_INPUT_SCHEMA_OR_AUTHORITY_INVALID")
    if not isinstance(judge_input["chunkId"], str) or not judge_input["chunkId"].strip():
        raise ValueError("JUDGE_INPUT_CHUNK_ID_INVALID")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(judge_input["chunkEvidenceRevision"])):
        raise ValueError("JUDGE_INPUT_CHUNK_REVISION_INVALID")
    for key in ("summaryOutputChecksum", "canonicalChunkTextChecksum", "judgeInputChecksum"):
        if not re.fullmatch(r"[a-f0-9]{64}", str(judge_input[key])):
            raise ValueError("JUDGE_INPUT_CHECKSUM_INVALID")
    if not isinstance(judge_input["canonicalChunkText"], str) or not judge_input["canonicalChunkText"].strip() or len(judge_input["canonicalChunkText"].encode("utf-8")) > 32 * 1024:
        raise ValueError("JUDGE_INPUT_CHUNK_TEXT_INVALID")
    expected_text_checksum = canonical_sha256_v1({"schema": "atlas.summary-judge-chunk-text.v1", "canonicalChunkText": judge_input["canonicalChunkText"]})
    if judge_input["canonicalChunkTextChecksum"] != expected_text_checksum:
        raise ValueError("JUDGE_INPUT_CHUNK_TEXT_CHECKSUM_MISMATCH")
    metadata = judge_input["promptVisibleMetadata"]
    if not isinstance(metadata, dict) or set(metadata) != {"product", "productVersion", "title", "headingPath"} or not isinstance(metadata["headingPath"], list):
        raise ValueError("JUDGE_INPUT_METADATA_INVALID")
    if not isinstance(judge_input["promptRevision"], str) or not judge_input["promptRevision"].strip() or judge_input["promptRevision"].strip().lower() in {"latest", "unknown"}:
        raise ValueError("JUDGE_INPUT_PROMPT_REVISION_INVALID")
    claim = judge_input["claim"]
    if not isinstance(claim, dict) or set(claim) != {"claimOrdinal", "claimText", "claimChecksum"}:
        raise ValueError("JUDGE_INPUT_CLAIM_INVALID")
    if type(claim["claimOrdinal"]) is not int or claim["claimOrdinal"] < 0 or not isinstance(claim["claimText"], str) or not claim["claimText"].strip():
        raise ValueError("JUDGE_INPUT_CLAIM_INVALID")
    if claim["claimChecksum"] != claim_checksum_v1(claim["claimText"]):
        raise ValueError("JUDGE_INPUT_CLAIM_CHECKSUM_MISMATCH")
    findings = judge_input["deterministicFindings"]
    expected_slots = {"technical", "numeric", "version", "sourceSpan"}
    if not isinstance(findings, dict) or set(findings) != expected_slots:
        raise ValueError("JUDGE_INPUT_FINDINGS_INVALID")
    slot_fields = {
        "technical": {"status", "sourceTokens", "claimTokens", "missingTechnicalTokens", "unexpectedTechnicalTokens"},
        "numeric": {"status", "sourceValues", "claimValues", "unsupportedValues"},
        "version": {"status", "sourceVersions", "claimVersions", "unsupportedVersions"},
        "sourceSpan": {"status", "spans"},
    }
    for key, fields in slot_fields.items():
        if not isinstance(findings[key], dict) or set(findings[key]) != fields:
            raise ValueError("JUDGE_INPUT_FINDINGS_INVALID")
    allowed_complete_statuses = {"PASS", "FAIL", "REVIEW"}
    if any(findings[key]["status"] == "NOT_RUN" for key in ("technical", "numeric", "version")):
        raise ValueError("JUDGE_INPUT_DETERMINISTIC_SLOT_NOT_RUN")
    if any(findings[key]["status"] not in allowed_complete_statuses for key in ("technical", "numeric", "version")):
        raise ValueError("JUDGE_INPUT_DETERMINISTIC_STATUS_INVALID")
    if findings["sourceSpan"]["status"] not in {"VERIFIED", "REJECTED", "NO_CLAIMED_SPAN"}:
        raise ValueError("JUDGE_INPUT_SOURCE_SPAN_STATE_INCOMPLETE")
    if canonical_sha256_v1({k: v for k, v in judge_input.items() if k != "judgeInputChecksum"}) != judge_input["judgeInputChecksum"]:
        raise ValueError("JUDGE_INPUT_SEAL_MISMATCH")


def build_messages(judge_input: dict[str, Any]) -> list[dict[str, str]]:
    """Deterministic prompt from ONLY the judge-visible fields; extra keys in the input are ignored by construction."""
    validate_judge_input_v1(judge_input)
    meta = judge_input["promptVisibleMetadata"]
    findings = judge_input["deterministicFindings"]
    brief = {k: {"status": v["status"], **({"unsupported": v.get("unexpectedTechnicalTokens") or v.get("unsupportedValues") or v.get("unsupportedVersions") or []} if v["status"] == "FAIL" else {})} for k, v in findings.items() if k != "sourceSpan"}
    brief["sourceSpan"] = {"status": findings["sourceSpan"]["status"]}
    user = (
        f"Product: {meta['product']} {meta['productVersion']}\nPage: {meta['title']}\nSection: {' > '.join(meta['headingPath']) or 'none'}\n"
        f"Deterministic findings: {json.dumps(brief, sort_keys=True)}\n\nChunk text:\n{judge_input['canonicalChunkText']}\n\nClaim:\n{judge_input['claim']['claimText']}"
    )
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]


def parse_output(raw: str) -> Optional[dict[str, Any]]:
    """First complete JSON object (fences/prose ignored); None if there is no valid verdict."""
    start = raw.find("{")
    if start < 0:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(raw[start:])
    except ValueError:
        return None
    if not isinstance(obj, dict) or obj.get("verdict") not in VERDICTS:
        return None
    fragment = obj.get("unsupportedFragment")
    return {"verdict": obj["verdict"], "unsupportedFragment": fragment if isinstance(fragment, str) and fragment.strip() and fragment.strip().lower() != "null" else None}


def resolve_model(llama_url: str, fetch: Callable[[str], Any] | None = None) -> dict[str, str]:
    """Gate: the resolved model must be Ornith 1.5 and listed by the server; returns id + explicit revision (never latest/unknown)."""
    get = fetch or (lambda path: json.load(urllib.request.urlopen(f"{llama_url}{path}", timeout=10)))
    props, models = get("/props"), get("/v1/models")
    alias = props.get("model_alias", "")
    if not _ORNITH.match(alias) or alias not in [m["id"] for m in models["data"]]:
        raise RuntimeError(f"JUDGE_MODEL_NOT_APPROVED:{alias}")
    path = str(props.get("model_path", "")).replace("\\", "/").rsplit("/", 1)[-1] or "unresolved-path"
    return {"id": alias, "revision": f"{alias}:{path}"}


def http_transport(llama_url: str, model: str, timeout: int = 120, on_response: Callable[[dict[str, Any]], None] | None = None) -> Transport:
    def call(messages: list[dict[str, str]]) -> str:
        body = json.dumps({"model": model, "temperature": 0, "max_tokens": 200, "stream": False, "seed": 1729, "messages": messages}).encode()
        req = urllib.request.Request(f"{llama_url}/v1/chat/completions", data=body, headers={"content-type": "application/json"})
        response = json.load(urllib.request.urlopen(req, timeout=timeout))
        if on_response is not None:
            on_response(response)
        return response["choices"][0]["message"]["content"]
    return call


def judge_claim_v1(judge_input: dict[str, Any], transport: Transport, model: dict[str, str]) -> dict[str, Any]:
    """Returns a VAL-01 `semantic` slot dict (validated against the Pydantic mirror). Never raises for model/transport/parse failures."""
    empty = {"verdict": None, "citedSpans": [], "unsupportedFragment": None, "judgeModelId": None, "judgeModelRevision": None, "judgePromptRevision": None, "independenceClass": None}
    parsed = None
    for attempt in range(2):  # ONE retry, transport-level failures only (timeout/HTTP); a parse failure is deterministic at temperature 0 and is never retried
        try:
            parsed = parse_output(transport(build_messages(judge_input)))
            break
        except Exception:  # still recorded as unknown, never as a pass
            parsed = None
    if parsed is None:
        return SemanticSlot.model_validate({"status": "JUDGE_ERROR", **empty}).model_dump()
    slot = {"status": "JUDGED", "verdict": parsed["verdict"], "citedSpans": [], "unsupportedFragment": parsed["unsupportedFragment"],
            "judgeModelId": model["id"], "judgeModelRevision": model["revision"], "judgePromptRevision": judge_input["promptRevision"], "independenceClass": "SAME_MODEL_SEMANTIC_JUDGE"}
    return SemanticSlot.model_validate(slot).model_dump()


def seal_judge_input_v1(body: dict[str, Any]) -> dict[str, Any]:
    """Python twin of the TS builder's seal (judgeInputChecksum = canonicalSha256V1 over the body); TS stays the owner."""
    return {**body, "judgeInputChecksum": canonical_sha256_v1(body)}


def build_judge_input_body_v1(*, row: dict[str, Any], expected_chunk_id: str, expected_revision: str, summary_output_checksum: str, metadata: dict[str, Any],
                              claim_ordinal: int, claim_text: str, findings: dict[str, Any], prompt_revision: str = PROMPT_REVISION) -> dict[str, Any]:
    """Built from an already-read row; id AND revision must match exactly (no 'latest chunk' lookup)."""
    if row.get("chunk_id") != expected_chunk_id:
        raise ValueError("CHUNK_ID_MISMATCH")
    if row.get("evidence_revision") != expected_revision:
        raise ValueError("REVISION_MISMATCH")
    return {
        "schema": "atlas.summary-judge-input.v1", "chunkId": row["chunk_id"], "chunkEvidenceRevision": row["evidence_revision"], "summaryOutputChecksum": summary_output_checksum,
        "canonicalChunkText": row["text"], "canonicalChunkTextChecksum": canonical_sha256_v1({"schema": "atlas.summary-judge-chunk-text.v1", "canonicalChunkText": row["text"]}), "promptVisibleMetadata": metadata,
        "claim": {"claimOrdinal": claim_ordinal, "claimText": claim_text, "claimChecksum": claim_checksum_v1(claim_text)},
        "deterministicFindings": findings, "promptRevision": prompt_revision, "canonicalAuthority": False,
    }
