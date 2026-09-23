"""VAL-07 live replay (READ ONLY, nothing persisted except docs/reports/summary-claim-judge-replay-v1.json).

For the 19 sampled chunk summaries in docs/reports/external-doc-summary-faithfulness-v1.json: read each canonical chunk by chunk_id AND
evidence_revision (Postgres SELECT only), split the summary into claims deterministically (sentences), run VAL-03/04/05 deterministic
validators, build the VAL-06 judge input, and call Ornith on :8090 through the VAL-07 judge. Records verdict distribution, judge errors and
whether the judge ever disagreed with a deterministic FAIL (it cannot override one; VAL-09 owns the decision). No summaries are stored.
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from atlas_summary_claim_judge_v1 import PROMPT_REVISION, build_judge_input_body_v1, http_transport, judge_claim_v1, resolve_model, seal_judge_input_v1
from atlas_summary_faithfulness_v1 import validate_summary_claim_numeric_v1, validate_summary_claim_technical_tokens_v1, validate_summary_claim_versions_v1
from atlas_doc_coordinate import canonical_sha256_v1

ROOT = Path(__file__).resolve().parents[1]
LLAMA = "http://127.0.0.1:8090"


def psql_row(chunk_id: str, revision: str) -> dict:
    sql = ("SELECT row_to_json(x) FROM (SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c "
           f"JOIN atlas_external_doc_pages p ON p.id = c.page_id WHERE c.chunk_id = '{chunk_id}' AND c.evidence_revision = '{revision}') x")
    out = subprocess.run(["docker", "exec", "-i", "legal-ai-postgres", "psql", "-U", "legal_admin", "-d", "legal_ai_db", "-tA"], input=sql, capture_output=True, text=True, encoding="utf-8", check=True).stdout.strip()
    if not out:
        raise RuntimeError(f"CHUNK_NOT_FOUND_AT_REVISION:{chunk_id}")
    return json.loads(out)


def claims_of(summary: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z`])", summary.strip()) if len(s.strip()) > 3]


def main() -> int:
    model = resolve_model(LLAMA)
    transport = http_transport(LLAMA, model["id"])
    src = json.loads((ROOT / "docs/reports/external-doc-summary-faithfulness-v1.json").read_text(encoding="utf-8"))
    results, verdicts, errors, disagreements = [], Counter(), 0, []
    t0 = time.perf_counter()
    for item in src["items"]:
        row = psql_row(item["chunkId"], item["chunkEvidenceRevision"])
        summary_checksum = canonical_sha256_v1({"text": item["summary"]})
        meta = {"product": row["product"], "productVersion": row["product_version"], "title": row["title"], "headingPath": row["heading_path"] or []}
        # validators see the chunk text PLUS the prompt-visible page header (product/version/title): the summary prompt included it, so claims may legitimately restate it
        source_text = row["text"] + "\n" + " ".join(str(v) for v in (row["product"], row["product_version"], row["title"]) if v)
        for ordinal, claim in enumerate(claims_of(item["summary"])):
            findings = {
                "technical": validate_summary_claim_technical_tokens_v1(source_text, claim),
                "numeric": validate_summary_claim_numeric_v1(source_text, claim),
                "version": validate_summary_claim_versions_v1(source_text, claim),
                "sourceSpan": {"status": "NO_CLAIMED_SPAN", "spans": []},
            }
            body = build_judge_input_body_v1(row=row, expected_chunk_id=item["chunkId"], expected_revision=item["chunkEvidenceRevision"], summary_output_checksum=summary_checksum,
                                             metadata=meta, claim_ordinal=ordinal, claim_text=claim, findings=findings)
            sealed = seal_judge_input_v1(body)
            slot = judge_claim_v1(sealed, transport, model)
            key = slot["verdict"] or slot["status"]
            verdicts[key] += 1
            errors += slot["status"] == "JUDGE_ERROR"
            det_fail = [k for k in ("technical", "numeric", "version") if findings[k]["status"] == "FAIL"]
            if det_fail and slot["verdict"] in ("SUPPORTED", "SUPPORTED_PARAPHRASE"):
                disagreements.append({"chunkId": item["chunkId"], "claim": claim, "deterministicFail": det_fail, "judge": slot["verdict"]})
            results.append({"chunkId": item["chunkId"], "claimOrdinal": ordinal, "claim": claim, "deterministicStatuses": {k: findings[k]["status"] for k in ("technical", "numeric", "version")},
                            "judgeInputChecksum": sealed["judgeInputChecksum"], "verdict": slot["verdict"], "status": slot["status"], "unsupportedFragment": slot["unsupportedFragment"]})
    receipt = {
        "schema": "atlas.summary-claim-judge-replay.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "VAL-07 live replay",
        "backend": {"kind": "llama-server (NOT Ollama)", "url": LLAMA, "resolvedModel": model, "promptRevision": PROMPT_REVISION, "independenceClass": "SAME_MODEL_SEMANTIC_JUDGE (weak second signal)"},
        "chunks": len(src["items"]), "claims": len(results), "verdictCounts": dict(verdicts), "judgeErrors": errors, "elapsedSeconds": round(time.perf_counter() - t0),
        "judgeSaidSupportedDespiteDeterministicFail": disagreements, "items": results,
        "invariants": {"judgeCannotOverrideDeterministicFailure": "VAL-09 owns the decision; this replay only records disagreement", "spansFromModel": "never trusted, none requested"},
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0}, "persistedSummaries": 0,
    }
    (ROOT / "docs/reports/summary-claim-judge-replay-v1.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("chunks", "claims", "verdictCounts", "judgeErrors", "elapsedSeconds")}, indent=1), "disagreements:", len(disagreements))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
