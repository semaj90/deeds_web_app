"""VAL10B_SUMMARY_PERSISTENCE_ADMISSION_01: admission of ONE exact summary text for persistence.

Runs the whole validation spine (canonical chunk re-read by chunk_id + evidence_revision, VAL-03/04 deterministic slots, VAL-06/07 Ornith judge,
VAL-09 resolution) on the EXACT text the caller intends to insert and returns a sealed report. The report binds chunk identity, the raw UTF-8 sha256
of the text, every claim's sealed validation and the code/judge/resolver revisions. A summary is eligible only if it has >= 1 claim and EVERY claim
resolved ADMIT. The persistence owner (summarize-external-doc-chunks-v1.mts) enforces the report on the same in-memory text it inserts, so there is
no check-then-write gap. Writes nothing anywhere; stdout JSON only.

CLI:  echo '{"items":[{"chunkId":..,"chunkEvidenceRevision":..,"summaryText":..}]}' | python atlas_summary_admission_v1.py   ->  {"reports":[...]}
"""
from __future__ import annotations

import hashlib
import json
import sys
from typing import Any, Callable

from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_claim_judge_replay_v1 import LLAMA
from atlas_summary_claim_judge_v1 import PROMPT_REVISION, http_transport, resolve_model
from atlas_summary_claim_resolution_v1 import ESCALATION_REVISION
from atlas_summary_claim_validation_replay_v1 import VALIDATOR_REVISION, one_pass

ADMISSION_SCHEMA = "atlas.summary-persistence-admission.v1"
CLAIM_SPLITTER_REVISION = "claims-of:sentence-regex-v1"


def admit_summary_v1(chunk_id: str, chunk_evidence_revision: str, summary_text: str, transport: Callable, model: dict[str, str]) -> dict[str, Any]:
    lineage: dict[str, Any] = {}
    resolved = one_pass([{"chunkId": chunk_id, "chunkEvidenceRevision": chunk_evidence_revision, "summary": summary_text}], transport, model, lineage)
    claims = [{
        "claimOrdinal": c["claimOrdinal"], "claimChecksum": c["claimChecksum"], "validationId": c["validationId"], "validationChecksum": c["validationChecksum"],
        "decision": c["result"]["decision"], "resolutionLayer": c["resolutionLayer"], "judgeInputChecksum": lineage[c["validationId"]]["judgeInputChecksum"],
    } for c in resolved]
    body = {
        "schema": ADMISSION_SCHEMA, "chunkId": chunk_id, "chunkEvidenceRevision": chunk_evidence_revision,
        "summaryOutputSha256": hashlib.sha256(summary_text.encode("utf-8")).hexdigest(), "summaryOutputChecksum": canonical_sha256_v1({"text": summary_text}),
        "splitterRevision": CLAIM_SPLITTER_REVISION, "claimCount": len(claims), "claims": claims,
        "wholeSummaryEligible": bool(claims) and all(c["decision"] == "ADMIT" for c in claims),
        "resolverRevision": ESCALATION_REVISION, "validatorRevision": VALIDATOR_REVISION, "judgePromptRevision": PROMPT_REVISION,
        "judgeModelRevision": next((c["semantic"]["judgeModelRevision"] for c in resolved if c["semantic"]["judgeModelRevision"]), None), "canonicalAuthority": False,
    }
    return {**body, "admissionChecksum": canonical_sha256_v1(body)}


def main() -> int:
    payload = json.load(sys.stdin)
    model = resolve_model(LLAMA)
    transport = http_transport(LLAMA, model["id"])
    reports = [admit_summary_v1(i["chunkId"], i["chunkEvidenceRevision"], i["summaryText"], transport, model) for i in payload["items"]]
    json.dump({"reports": reports}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
