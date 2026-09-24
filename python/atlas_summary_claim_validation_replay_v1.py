"""VAL-10 replay (READ ONLY; writes only docs/reports/summary-claim-validation-replay-v1.json).

Runs the full validation chain TWICE over the 19 sampled chunk summaries (51 claims): canonical chunk read by chunk_id + evidence_revision,
deterministic VAL-03/04 validators, the VAL-07 Ornith judge (llama-server :8090), then composes a sealed SummaryClaimValidation per claim and
resolves it with VAL-09. Records decisions, resolving layers, judge errors and whether the two passes produced identical sealed objects.
Persists nothing to Postgres/Qdrant/Valkey/Neo4j and stores no summaries.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_claim_judge_replay_v1 import LLAMA, claims_of, psql_row
from atlas_summary_claim_judge_v1 import PROMPT_REVISION, build_judge_input_body_v1, http_transport, judge_claim_v1, resolve_model, seal_judge_input_v1
from atlas_summary_claim_resolution_v1 import layer_telemetry_v1, resolve_and_seal_v1
from atlas_summary_claim_validation_v1 import SCHEMA, SummaryClaimValidation, seal_v1
from atlas_summary_faithfulness_v1 import validate_summary_claim_numeric_v1, validate_summary_claim_technical_tokens_v1, validate_summary_claim_versions_v1

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_REVISION = "summary-claim-validator:val-10-replay-v1"
SLOT_FIELDS = {
    "technical": ("status", "sourceTokens", "claimTokens", "missingTechnicalTokens", "unexpectedTechnicalTokens"),
    "numeric": ("status", "sourceValues", "claimValues", "unsupportedValues"),
    "version": ("status", "sourceVersions", "claimVersions", "unsupportedVersions"),
}


def one_pass(items: list[dict], transport, model: dict) -> list[dict]:
    resolved: list[dict] = []
    for item in items:
        row = psql_row(item["chunkId"], item["chunkEvidenceRevision"])
        summary_checksum = canonical_sha256_v1({"text": item["summary"]})
        meta = {"product": row["product"], "productVersion": row["product_version"], "title": row["title"], "headingPath": row["heading_path"] or []}
        source_text = row["text"] + "\n" + " ".join(str(v) for v in (row["product"], row["product_version"], row["title"]) if v)
        input_checksum = canonical_sha256_v1({"chunkId": item["chunkId"], "chunkEvidenceRevision": item["chunkEvidenceRevision"], "text": row["text"]})
        for ordinal, claim in enumerate(claims_of(item["summary"])):
            det = {
                "technical": validate_summary_claim_technical_tokens_v1(source_text, claim),
                "numeric": validate_summary_claim_numeric_v1(source_text, claim),
                "version": validate_summary_claim_versions_v1(source_text, claim),
            }
            findings = {**det, "sourceSpan": {"status": "NO_CLAIMED_SPAN", "spans": []}}
            body_in = build_judge_input_body_v1(row=row, expected_chunk_id=item["chunkId"], expected_revision=item["chunkEvidenceRevision"], summary_output_checksum=summary_checksum,
                                                metadata=meta, claim_ordinal=ordinal, claim_text=claim, findings=findings)
            sem = judge_claim_v1(seal_judge_input_v1(body_in), transport, model)
            body = {
                "schema": SCHEMA, "chunkId": item["chunkId"], "chunkEvidenceRevision": item["chunkEvidenceRevision"], "analysisId": None,
                "summaryInputChecksum": input_checksum, "summaryOutputChecksum": summary_checksum, "claimOrdinal": ordinal, "claimText": claim,
                **{k: {f: det[k][f] for f in fields} for k, fields in SLOT_FIELDS.items()},
                "sourceSpan": {"status": "NO_CLAIMED_SPAN", "spans": []},
                "semantic": {f: sem[f] for f in ("status", "verdict", "citedSpans", "unsupportedFragment", "judgeModelId", "judgeModelRevision", "judgePromptRevision", "independenceClass")},
                "ontology": {"status": "NOT_RUN", "kernelRevision": None, "assertions": []},
                "result": {"decision": "PENDING", "escalationRevision": None}, "resolutionLayer": "NOT_RESOLVED",
                "validatorRevision": VALIDATOR_REVISION, "canonicalAuthority": False,
            }
            sealed = {**body, **seal_v1(body)}
            SummaryClaimValidation.model_validate(sealed)  # the composed pre-resolution object must itself be a valid sealed contract
            resolved.append(resolve_and_seal_v1(sealed))
    return resolved


def main() -> int:
    model = resolve_model(LLAMA)
    transport = http_transport(LLAMA, model["id"])
    src = json.loads((ROOT / "docs/reports/external-doc-summary-faithfulness-v1.json").read_text(encoding="utf-8"))
    t0 = time.perf_counter()
    first = one_pass(src["items"], transport, model)
    second = one_pass(src["items"], transport, model)
    by_id = {c["validationId"]: c for c in second}
    unstable = [{"validationId": c["validationId"], "claim": c["claimText"], "pass1": c["result"]["decision"], "pass2": by_id[c["validationId"]]["result"]["decision"],
                 "semantic1": c["semantic"]["verdict"], "semantic2": by_id[c["validationId"]]["semantic"]["verdict"]}
                for c in first if by_id.get(c["validationId"], {}).get("validationChecksum") != c["validationChecksum"]]
    judge_errors = sum(c["semantic"]["status"] == "JUDGE_ERROR" for c in first)
    admitted_with_det_fail = [c["validationId"] for c in first if c["result"]["decision"] == "ADMIT" and any(c[k]["status"] == "FAIL" for k in ("technical", "numeric", "version"))]
    unresolved = [c["validationId"] for c in first if c["resolutionLayer"] == "NOT_RESOLVED" or c["result"]["decision"] == "PENDING"]
    receipt = {
        "schema": "atlas.summary-claim-validation-replay.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "VAL-10",
        "backend": {"kind": "llama-server (NOT Ollama)", "url": LLAMA, "resolvedModel": model, "promptRevision": PROMPT_REVISION},
        "validatorRevision": VALIDATOR_REVISION, "chunks": len(src["items"]), "claims": len(first), "elapsedSeconds": round(time.perf_counter() - t0),
        "telemetry": layer_telemetry_v1(first), "judgeErrors": judge_errors,
        "criteria": {
            "everyClaimResolvedWithLayer": not unresolved, "zeroAdmitWithDeterministicFail": not admitted_with_det_fail,
            "judgeErrorsZeroOrRoutedToReview": all(c["result"]["decision"] == "REVIEW" for c in first if c["semantic"]["status"] == "JUDGE_ERROR"),
            "secondReplayIdentical": not unstable, "eachObjectValidatesWithPythonMirror": True, "eachObjectValidatesWithZod": "checked separately by the TypeScript step",
        },
        "unresolved": unresolved, "admittedWithDeterministicFail": admitted_with_det_fail, "unstableBetweenPasses": unstable,
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0}, "persistedSummaries": 0, "objects": first,
    }
    (ROOT / "docs/reports/summary-claim-validation-replay-v1.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("chunks", "claims", "elapsedSeconds", "telemetry", "judgeErrors", "criteria")}, indent=1))
    print("unstable:", len(unstable), "admitWithDetFail:", len(admitted_with_det_fail))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
