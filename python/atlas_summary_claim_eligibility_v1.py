"""VAL-10 read-only replay: exact 19-chunk source -> regenerated SUMMARY -> claim validation -> VAL-09 dry-run.

No summary persistence flag exists in this runner. Its only durable output is a proof receipt.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_claim_judge_replay_v1 import claims_of, psql_row
from atlas_summary_claim_judge_v1 import PROMPT_REVISION as JUDGE_PROMPT_REVISION
from atlas_summary_claim_judge_v1 import build_judge_input_body_v1, http_transport, judge_claim_v1, resolve_model, seal_judge_input_v1, validate_judge_input_v1
from atlas_summary_claim_validation_v1 import SummaryClaimValidation, seal_v1
from atlas_summary_faithfulness_v1 import (
    LLAMA, ROOT, SYSTEM_PROMPT, USER_TEMPLATE, assess,
    summarize, validate_summary_claim_numeric_v1, validate_summary_claim_technical_tokens_v1,
    validate_summary_claim_versions_v1,
)

REPORT = ROOT / "docs/reports/parent-atlas/val-10-summary-eligibility-replay-v1.json"
FIXTURE = ROOT / "docs/reports/external-doc-summary-faithfulness-v1.json"
RESOLVER = ROOT / "scripts/atlas/resolve-summary-claim-eligibility-v1.mts"
MAX_APPLY_LIMIT = 20
EXPECTED_CHUNKS = 19


def _summary_request_identity(chunk: dict, model_id: str) -> dict:
    user = (USER_TEMPLATE.replace("{product}", chunk["product"]).replace("{productVersion}", chunk["ver"]).replace("{title}", chunk["title"])
            .replace("{headingPath}", " > ".join(chunk["head"] or []) or "none").replace("{chunkEvidenceRevision}", chunk["rev"]).replace("{text}", chunk["text"]))
    return {
        # Canonical hash V1 accepts lowerCamel object keys; this identity mirrors the
        # OpenAI wire request without hashing transport-specific snake_case field names.
        "modelId": model_id, "temperature": 0.2, "maxTokens": 300, "stream": False, "seed": 1729,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
    }


def _ts_resolve(batch: dict) -> dict:
    node = shutil.which("node")
    if not node or not RESOLVER.is_file():
        raise RuntimeError("VAL10_TS_RESOLVER_OR_NODE_UNAVAILABLE")
    result = subprocess.run(
        [node, "--import", "tsx", str(RESOLVER)],
        input=json.dumps(batch, ensure_ascii=False, separators=(",", ":")),
        text=True, encoding="utf-8", capture_output=True, check=True,
        cwd=ROOT / "sveltekit-frontend", timeout=120,
    )
    return json.loads(result.stdout)


def _read_exact_chunk(sample: dict) -> dict:
    chunk_id = sample.get("chunkId", "")
    revision = sample.get("chunkEvidenceRevision", "")
    # The existing psql helper builds a literal SELECT; reject all nonliteral shapes before passing through.
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,256}", chunk_id):
        raise ValueError("VAL10_CHUNK_ID_NOT_SAFE_FOR_EXACT_READ")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", revision):
        raise ValueError("VAL10_CHUNK_REVISION_INVALID")
    row = psql_row(chunk_id, revision)
    if row.get("chunk_id") != chunk_id or row.get("evidence_revision") != revision:
        raise ValueError("VAL10_EXACT_SOURCE_READBACK_MISMATCH")
    return row


def _summary_analysis_count() -> int:
    sql = "BEGIN READ ONLY; SELECT count(*) FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY'; ROLLBACK;"
    result = subprocess.run(
        ["docker", "exec", "-i", "legal-ai-postgres", "psql", "-X", "-A", "-t",
         "-v", "ON_ERROR_STOP=1", "-U", "legal_admin", "-d", "legal_ai_db"],
        input=sql, text=True, encoding="utf-8", capture_output=True, check=True, timeout=20,
    )
    values = [line.strip() for line in result.stdout.splitlines() if line.strip().isdigit()]
    if len(values) != 1:
        raise RuntimeError("VAL10_SUMMARY_ANALYSIS_READBACK_SHAPE_INVALID")
    return int(values[0])


def main() -> int:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    samples = fixture.get("items", [])
    if len(samples) != EXPECTED_CHUNKS or len({(item.get("chunkId"), item.get("chunkEvidenceRevision")) for item in samples}) != EXPECTED_CHUNKS:
        raise RuntimeError("VAL10_EXPECTED_19_UNIQUE_REVISION_QUALIFIED_CHUNKS")
    analysis_rows_before = _summary_analysis_count()

    model = resolve_model(LLAMA)
    listed = json.load(__import__("urllib.request", fromlist=["urlopen"]).urlopen(f"{LLAMA}/v1/models", timeout=10))["data"]
    if model["id"] not in [entry.get("id") for entry in listed]:
        raise RuntimeError("VAL10_RESOLVED_MODEL_NOT_LISTED")
    transport = http_transport(LLAMA, model["id"])
    created_at = datetime.now(timezone.utc).isoformat()
    prompt_bytes = json.dumps({"system": SYSTEM_PROMPT, "template": USER_TEMPLATE, "temperature": 0.2, "max_tokens": 300, "seed": 1729}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    prompt_revision = "summary-prompt:sha256:" + hashlib.sha256(prompt_bytes).hexdigest()
    producer_material = inspect.getsource(summarize) + "\n" + SYSTEM_PROMPT + "\n" + USER_TEMPLATE
    producer_revision = "sha256:" + hashlib.sha256(producer_material.encode("utf-8")).hexdigest()

    validations: list[dict] = []
    analysis_candidates: list[dict] = []
    cohort = []
    for sample in samples:
        row = _read_exact_chunk(sample)
        source_chunk = {
            "id": row["chunk_id"], "rev": row["evidence_revision"], "text": row["text"],
            "head": row.get("heading_path") or [], "title": row.get("title") or "",
            "product": row.get("product") or "", "ver": row.get("product_version") or "",
        }
        if source_chunk["rev"] != sample["chunkEvidenceRevision"]:
            raise RuntimeError("VAL10_SAMPLE_SOURCE_REVISION_DRIFT")

        summary_input_identity = _summary_request_identity(source_chunk, model["id"])
        summary_input_checksum = canonical_sha256_v1(summary_input_identity)
        summary, finish_reason, completion_tokens, latency_ms = summarize(source_chunk, model["id"])
        summary_output_checksum = canonical_sha256_v1({"text": summary})
        source_text = source_chunk["text"] + "\n" + " ".join(v for v in (source_chunk["product"], source_chunk["ver"], source_chunk["title"]) if v)
        group_key = source_chunk["id"] + "@" + source_chunk["rev"]
        analyses_body = {
            "schema": "atlas.external-doc-analysis.v1", "chunkId": source_chunk["id"],
            "chunkEvidenceRevision": source_chunk["rev"], "analysisType": "SUMMARY",
            "producerId": "python.atlas_summary_faithfulness_v1.summarize", "producerRevision": producer_revision,
            "modelId": model["id"], "modelRevision": model["revision"], "promptRevision": prompt_revision,
            "inputChecksum": summary_input_checksum, "outputChecksum": summary_output_checksum,
            "summaryText": summary,
            "metadata": {"execution": "VAL10_READ_ONLY_REPLAY", "canonicalAuthority": False, "finishReason": finish_reason},
            "canonicalAuthority": False, "createdAt": created_at,
        }
        analysis_candidates.append({"groupKey": group_key, "analysis": analyses_body})

        claim_rows = []
        for ordinal, claim in enumerate(claims_of(summary)):
            technical = validate_summary_claim_technical_tokens_v1(source_text, claim)
            numeric = validate_summary_claim_numeric_v1(source_text, claim)
            version = validate_summary_claim_versions_v1(source_text, claim)
            findings = {
                "technical": technical, "numeric": numeric, "version": version,
                "sourceSpan": {"status": "NO_CLAIMED_SPAN", "spans": []},
            }
            judge_body = build_judge_input_body_v1(
                row=row, expected_chunk_id=source_chunk["id"], expected_revision=source_chunk["rev"],
                summary_output_checksum=summary_output_checksum,
                metadata={"product": source_chunk["product"] or None, "productVersion": source_chunk["ver"] or None,
                          "title": source_chunk["title"] or None, "headingPath": source_chunk["head"]},
                claim_ordinal=ordinal, claim_text=claim, findings=findings,
            )
            judge_input = seal_judge_input_v1(judge_body)
            validate_judge_input_v1(judge_input)
            semantic = judge_claim_v1(judge_input, transport, model)
            validation_input = {
                "schema": "atlas.summary-claim-validation.v1", "chunkId": source_chunk["id"],
                "chunkEvidenceRevision": source_chunk["rev"], "analysisId": None,
                "summaryInputChecksum": summary_input_checksum, "summaryOutputChecksum": summary_output_checksum,
                "claimOrdinal": ordinal, "claimText": claim,
                "technical": technical, "numeric": numeric, "version": version,
                "sourceSpan": {"status": "NO_CLAIMED_SPAN", "spans": []},
                "semantic": semantic, "ontology": {"status": "NOT_APPLICABLE", "kernelRevision": None, "assertions": []},
                "result": {"decision": "PENDING", "escalationRevision": None},
                "resolutionLayer": "NOT_RESOLVED", "validatorRevision": "summary-claim-validator:val-03-07-v1",
                "canonicalAuthority": False,
            }
            validations.append({"groupKey": group_key, "validation": {**validation_input, **seal_v1(validation_input)}})
            claim_rows.append({"claimChecksum": canonical_sha256_v1({"schema": "atlas.summary-claim.v1", "claimText": claim}),
                               "judgeInputChecksum": judge_input["judgeInputChecksum"], "status": semantic["status"], "verdict": semantic["verdict"]})
        cohort.append({
            "chunkId": source_chunk["id"], "chunkEvidenceRevision": source_chunk["rev"],
            "summaryInputChecksum": summary_input_checksum, "summaryOutputChecksum": summary_output_checksum,
            "claimCount": len(claim_rows), "finishReason": finish_reason,
            "completionTokens": completion_tokens, "latencyMs": round(latency_ms), "claims": claim_rows,
        })

    resolved = _ts_resolve({"claimValidations": validations, "analysisCandidates": analysis_candidates, "maximumApplyLimit": MAX_APPLY_LIMIT})
    if len(resolved.get("groups", [])) != EXPECTED_CHUNKS or not resolved.get("withinBound"):
        raise RuntimeError("VAL10_RESOLVER_COHORT_OR_BOUND_MISMATCH")
    resolved_by_key = {group["groupKey"]: group for group in resolved["groups"]}
    for item in cohort:
        key = item["chunkId"] + "@" + item["chunkEvidenceRevision"]
        item["resolution"] = resolved_by_key[key]

    analysis_rows_after = _summary_analysis_count()
    eligible = sum(1 for item in cohort if item["resolution"]["eligible"])
    judge_error_count = sum(
        1 for item in cohort for claim in item["claims"]
        if claim["status"] != "JUDGED"
    )
    all_analysis_envelopes_valid = all(
        group.get("analysisEnvelopeValid") is True for group in resolved["groups"]
    )
    replay_proven = (
        eligible > 0
        and judge_error_count == 0
        and all_analysis_envelopes_valid
        and len(cohort) == EXPECTED_CHUNKS
        and len(validations) > 0
        and resolved.get("withinBound") is True
        and analysis_rows_after == analysis_rows_before
    )
    receipt = {
        "schema": "atlas.val-10.summary-apply-eligibility-replay.v1", "gate": "VAL-10",
        "contractOwner": "sveltekit-frontend",
        "contractPath": "src/lib/server/atlas/docs/summary-claim-validation-v1.ts",
        "packageProjection": False,
        "generatedAt": created_at, "mode": "READ_ONLY_BOUNDED_REPLAY",
        "inputFixture": str(FIXTURE.relative_to(ROOT)).replace("\\", "/"),
        "expectedChunkCount": EXPECTED_CHUNKS, "observedChunkCount": len(cohort),
        "model": model, "listedModelIds": [entry["id"] for entry in listed if entry.get("id")],
        "summaryPromptRevision": prompt_revision, "summaryProducerRevision": producer_revision,
        "judgePromptRevision": JUDGE_PROMPT_REVISION,
        "limit": MAX_APPLY_LIMIT, "analysisEnvelopeCount": len(analysis_candidates),
        "analysisEnvelopesAllValid": all_analysis_envelopes_valid,
        "analysisEnvelopeIds": [group["analysisId"] for group in resolved["groups"]],
        "claimCount": len(validations), "claimDecisionCounts": resolved["claimDecisionCounts"],
        "judgeErrorCount": judge_error_count,
        "eligibleSummaryCount": eligible, "excludedSummaryCount": EXPECTED_CHUNKS - eligible,
        "withinLimit": resolved["withinBound"], "cohort": cohort,
        "summaryWrites": 0,
        "analysisRowsBefore": analysis_rows_before, "analysisRowsAfter": analysis_rows_after,
        "analysisRowCountUnchanged": analysis_rows_after == analysis_rows_before,
        "persistentWriteAuthorization": "NOT_REQUESTED_OR_USED",
        "result": "VAL10_BOUNDED_ELIGIBILITY_PROVEN" if replay_proven else "VAL10_REPLAY_PARTIAL_OR_NO_SUMMARY_ELIGIBLE",
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0, "filesystemProofReceipt": 1},
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({key: receipt[key] for key in ("result", "observedChunkCount", "claimCount", "claimDecisionCounts", "eligibleSummaryCount", "excludedSummaryCount", "limit", "summaryWrites")}, indent=2))
    return 0 if replay_proven else 2


if __name__ == "__main__":
    raise SystemExit(main())
