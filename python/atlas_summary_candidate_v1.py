"""VAL-10C / VAL-10A: evaluation of FROZEN SummaryCandidateV1 objects (Python twin of sveltekit-frontend/.../summary-candidate-v1.ts; TypeScript owns the seals).

  evaluate : for each frozen candidate, extract its claim set, run the validation spine on the EXACT candidate text (deterministic slots, Ornith judge, VAL-09) and
             emit a sealed SummaryEligibilityV1. The judge is the only model call; the candidate is never regenerated.
  replay   : recompute claim sets, validations, resolutions and eligibility from the frozen candidates and the FROZEN judge verdicts with NO model call, and compare
             every checksum with the frozen evaluation.
Writes nothing to any store; the CLI writes only the JSON file it is asked to.

  python atlas_summary_candidate_v1.py evaluate --cohort <cohort.json> --out <evaluation.json>
  python atlas_summary_candidate_v1.py replay   --cohort <cohort.json> --evaluation <evaluation.json> --out <receipt.json>
  python atlas_summary_candidate_v1.py negative-control --cohort <cohort.json> --faithfulness <report.json> --out <control-cohort.json>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any, Callable

from atlas_doc_coordinate import canonical_sha256_v1
from atlas_summary_admission_v1 import CLAIM_SPLITTER_REVISION
from atlas_summary_claim_judge_replay_v1 import LLAMA, claims_of
from atlas_summary_claim_judge_v1 import PROMPT_REVISION, http_transport, judge_claim_v1, resolve_model
from atlas_summary_claim_resolution_v1 import ESCALATION_REVISION
from atlas_summary_claim_validation_replay_v1 import ROOT, SPINE_MODULES, one_pass
from atlas_summary_claim_validation_v1 import claim_checksum_v1

CANDIDATE_SCHEMA = "atlas.summary-candidate.v1"
CLAIM_SET_SCHEMA = "atlas.summary-claim-set.v1"
ELIGIBILITY_SCHEMA = "atlas.summary-eligibility.v1"
VALIDATION_CONTRACT_REVISION = "summary-claim-validator:val-10-candidate-v1"
EXTRACTOR_REVISION = CLAIM_SPLITTER_REVISION
SPINE_FILES = SPINE_MODULES + ["python/atlas_summary_candidate_v1.py"]


def read_chunk_at_revision(chunk_id: str, revision: str) -> dict[str, Any]:
    """Canonical chunk read by chunk_id AND evidence_revision: read-only transaction, psql-bound variables (identity data is never interpolated into SQL), quiet output, and
    the row's own identity is re-checked. Fails closed when the chunk is missing at that revision."""
    if not chunk_id or "\x00" in chunk_id or not re.fullmatch(r"sha256:[0-9a-f]{64}", revision):
        raise ValueError("CHUNK_ID_OR_EVIDENCE_REVISION_INVALID")
    sql = ("BEGIN TRANSACTION READ ONLY; SELECT row_to_json(x) FROM (SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version "
           "FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id WHERE c.chunk_id = :'chunk_id' AND c.evidence_revision = :'revision') x; ROLLBACK;")
    out = subprocess.run(["docker", "exec", "-i", "legal-ai-postgres", "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", f"chunk_id={chunk_id}", "-v", f"revision={revision}", "-U", "legal_admin", "-d", "legal_ai_db", "-tA"],
                         input=sql, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    lines = [ln for ln in out.splitlines() if ln.startswith("{")]  # the JSON row; command tags (BEGIN/ROLLBACK) are ignored
    if len(lines) != 1:
        raise RuntimeError(f"CHUNK_NOT_FOUND_AT_REVISION:{chunk_id}")
    row = json.loads(lines[0])
    if row.get("chunk_id") != chunk_id or row.get("evidence_revision") != revision:
        raise RuntimeError("CHUNK_READBACK_IDENTITY_MISMATCH")
    return row


def raw_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def candidate_id_v1(candidate_body: dict[str, Any]) -> str:
    return "sc:" + canonical_sha256_v1(candidate_body)


def verify_candidate_v1(candidate: dict[str, Any]) -> dict[str, Any]:
    """Independent seal check (parity with TypeScript verifySummaryCandidateV1): schema, raw text hash, then the id recomputed from every immutable field."""
    if candidate.get("schema") != CANDIDATE_SCHEMA or candidate.get("canonicalAuthority") is not False:
        raise ValueError("CANDIDATE_INVALID")
    if candidate["outputChecksum"] != raw_sha256(candidate["summaryText"]):
        raise ValueError("SUMMARY_OUTPUT_CHECKSUM_MISMATCH")
    body = {k: v for k, v in candidate.items() if k != "candidateId"}
    if candidate["candidateId"] != candidate_id_v1(body):
        raise ValueError("CANDIDATE_ID_MISMATCH")
    return candidate


def build_claim_set_v1(candidate: dict[str, Any]) -> dict[str, Any]:
    claims = claims_of(candidate["summaryText"])
    if not claims:
        raise ValueError("CLAIM_SET_EMPTY")
    body = {"schema": CLAIM_SET_SCHEMA, "candidateId": candidate["candidateId"], "extractorRevision": EXTRACTOR_REVISION,
            "claimList": [{"claimOrdinal": i, "claimText": t, "claimChecksum": claim_checksum_v1(t)} for i, t in enumerate(claims)]}
    return {**body, "claimSetChecksum": canonical_sha256_v1(body)}


def spine_revision_v1() -> str:
    """Content identity of the code that produced an evaluation (works uncommitted): sha256 over each spine module's bytes."""
    return canonical_sha256_v1({"schema": "atlas.summary-spine-revision.v1", "modules": [{"path": m, "sha256": hashlib.sha256((ROOT / m).read_bytes()).hexdigest()} for m in SPINE_FILES]})


def evaluate_candidate_v1(candidate: dict[str, Any], judge: Callable[[dict[str, Any]], dict[str, Any]], judge_model_revision: str, reader: Callable[[str, str], dict[str, Any]] | None = None) -> dict[str, Any]:
    verify_candidate_v1(candidate)
    claim_set = build_claim_set_v1(candidate)
    lineage: dict[str, Any] = {}
    resolved = one_pass([{"chunkId": candidate["chunkId"], "chunkEvidenceRevision": candidate["chunkEvidenceRevision"], "summary": candidate["summaryText"], "summaryInputChecksum": candidate["inputChecksum"]}],
                        None, {}, lineage, judge=judge, validator_revision=VALIDATION_CONTRACT_REVISION, reader=reader or read_chunk_at_revision)
    if [c["claimChecksum"] for c in resolved] != [c["claimChecksum"] for c in claim_set["claimList"]]:
        raise ValueError("CLAIM_SET_DIVERGES_FROM_VALIDATED_CLAIMS")  # the claims validated must be exactly the frozen claim set
    resolutions = [{"claimOrdinal": c["claimOrdinal"], "claimChecksum": c["claimChecksum"], "validationId": c["validationId"], "validationChecksum": c["validationChecksum"],
                    "judgeInputChecksum": lineage[c["validationId"]]["judgeInputChecksum"], "decision": c["result"]["decision"], "resolutionLayer": c["resolutionLayer"]} for c in resolved]
    body = {"schema": ELIGIBILITY_SCHEMA, "candidateId": candidate["candidateId"], "claimSetChecksum": claim_set["claimSetChecksum"], "validationContractRevision": VALIDATION_CONTRACT_REVISION,
            "spineRevision": spine_revision_v1(), "judgePromptRevision": PROMPT_REVISION, "judgeModelRevision": judge_model_revision, "resolverPolicyRevision": ESCALATION_REVISION,
            "resolutions": resolutions, "eligible": bool(resolutions) and all(r["decision"] == "ADMIT" for r in resolutions)}
    return {"claimSet": claim_set, "validations": resolved, "eligibility": {**body, "eligibilityChecksum": canonical_sha256_v1(body)}}


def frozen_judge(validations: list[dict[str, Any]], lineage_by_validation: dict[str, str]) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """A judge that returns the FROZEN semantic slot for a judge input (keyed by judgeInputChecksum). It can never call a model; a judge input it has not seen means the
    deterministic layers drifted, which is reported as an error rather than silently re-judged."""
    by_input = {lineage_by_validation[v["validationId"]]: v["semantic"] for v in validations}

    def judge(sealed: dict[str, Any]) -> dict[str, Any]:
        if sealed["judgeInputChecksum"] not in by_input:
            raise LookupError("FROZEN_JUDGE_INPUT_NOT_FOUND")
        return by_input[sealed["judgeInputChecksum"]]
    return judge


def summarize(entries: list[dict[str, Any]]) -> dict[str, Any]:
    decisions = Counter(r["decision"] for e in entries for r in e["eligibility"]["resolutions"])
    return {"candidates": len(entries), "claims": sum(len(e["claimSet"]["claimList"]) for e in entries), "eligible": sum(e["eligibility"]["eligible"] for e in entries),
            "ineligible": sum(not e["eligibility"]["eligible"] for e in entries), "claimDecisions": dict(decisions)}


def _load(path: str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cmd_evaluate(args: argparse.Namespace) -> int:
    cohort = _load(args.cohort)
    model = resolve_model(LLAMA)
    transport = http_transport(LLAMA, model["id"])
    entries = []
    for candidate in cohort["candidates"]:
        entries.append({"candidateId": candidate["candidateId"], **evaluate_candidate_v1(candidate, lambda sealed: judge_claim_v1(sealed, transport, model), model["revision"])})
    out = {"schema": "atlas.summary-candidate-evaluation.v1", "cohort": {"candidateCohortChecksum": cohort["candidateCohortChecksum"], "chunkCohortChecksum": cohort["chunkCohortChecksum"]},
           "judge": {"modelId": model["id"], "modelRevision": model["revision"], "promptRevision": PROMPT_REVISION, "backend": "llama-server (NOT Ollama)"}, "spineRevision": spine_revision_v1(),
           "counts": summarize(entries), "entries": entries, "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0}}
    Path(args.out).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"counts": out["counts"], "spineRevision": out["spineRevision"]}, indent=1))
    return 0


def cmd_replay(args: argparse.Namespace) -> int:
    cohort, frozen = _load(args.cohort), _load(args.evaluation)
    by_id = {e["candidateId"]: e for e in frozen["entries"]}
    model_calls = {"n": 0}
    entries, mismatches = [], []
    for candidate in cohort["candidates"]:
        f = by_id[candidate["candidateId"]]
        lineage = {r["validationId"]: r["judgeInputChecksum"] for r in f["eligibility"]["resolutions"]}
        again = evaluate_candidate_v1(candidate, frozen_judge(f["validations"], lineage), f["eligibility"]["judgeModelRevision"])
        entries.append({"candidateId": candidate["candidateId"], **again})
        for name, a, b in (("claimSetChecksum", again["claimSet"]["claimSetChecksum"], f["claimSet"]["claimSetChecksum"]),
                           ("validationChecksums", [v["validationChecksum"] for v in again["validations"]], [v["validationChecksum"] for v in f["validations"]]),
                           ("resolutions", again["eligibility"]["resolutions"], f["eligibility"]["resolutions"]),
                           ("eligibilityChecksum", again["eligibility"]["eligibilityChecksum"], f["eligibility"]["eligibilityChecksum"])):
            if a != b:
                mismatches.append({"candidateId": candidate["candidateId"], "field": name})
    receipt = {"schema": "atlas.summary-candidate-frozen-replay.v1", "gate": "VAL10_FROZEN_COHORT_DETERMINISTIC_REPLAY", "candidateCohortChecksum": cohort["candidateCohortChecksum"],
               "candidates": len(entries), "claims": summarize(entries)["claims"], "modelCalls": model_calls["n"], "identical": not mismatches, "mismatches": mismatches,
               "spineRevisionFrozen": frozen["spineRevision"], "spineRevisionNow": spine_revision_v1(), "counts": summarize(entries),
               "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0}}
    Path(args.out).write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("candidates", "claims", "modelCalls", "identical", "mismatches", "counts")}, indent=1))
    return 0 if not mismatches else 1


def chunk_cohort_checksum_v1(pairs: list[dict[str, str]]) -> str:
    return canonical_sha256_v1({"schema": "atlas.summary-chunk-cohort.v1", "pairs": sorted(pairs, key=lambda p: p["chunkId"] + p["chunkEvidenceRevision"])})


def candidate_cohort_checksum_v1(candidate_ids: list[str]) -> str:
    return canonical_sha256_v1({"schema": "atlas.summary-candidate-cohort.v1", "candidateIds": sorted(candidate_ids)})


def cmd_negative_control(args: argparse.Namespace) -> int:
    """A NEGATIVE CONTROL, not part of the authoritative cohort: the historical summary that the deterministic gate flagged UNSUPPORTED (an invented technical term),
    re-wrapped as a candidate on its real chunk/revision and labelled as a control. It goes through the same spine; the writer must refuse it."""
    cohort, report = _load(args.cohort), _load(args.faithfulness)
    flagged = [i for i in report["items"] if i["label"] == "UNSUPPORTED"]
    if len(flagged) != 1:
        raise SystemExit("NEGATIVE_CONTROL_SOURCE_NOT_UNIQUE")
    src = flagged[0]
    base = next((c for c in cohort["candidates"] if c["chunkId"] == src["chunkId"] and c["chunkEvidenceRevision"] == src["chunkEvidenceRevision"]), None)
    if base is None:
        raise SystemExit("NEGATIVE_CONTROL_CHUNK_NOT_IN_COHORT")
    body = {k: v for k, v in base.items() if k != "candidateId"}
    body.update({"producerId": "atlas-summary-negative-control", "producerRevision": "negative-control:historical-unsupported-summary", "promptRevision": "negative-control:not-generated", "summaryText": src["summary"], "outputChecksum": raw_sha256(src["summary"])})
    control = {**body, "candidateId": candidate_id_v1(body)}
    pairs = [{"chunkId": control["chunkId"], "chunkEvidenceRevision": control["chunkEvidenceRevision"]}]
    out = {"schema": "atlas.summary-candidate-cohort.v1", "control": True, "purpose": "NEGATIVE_CONTROL: must be refused by the writer; NOT part of the authoritative cohort", "source": args.faithfulness, "unsupportedTokens": src["unsupportedTokens"],
           "chunkCohortChecksum": chunk_cohort_checksum_v1(pairs), "candidateCohortChecksum": candidate_cohort_checksum_v1([control["candidateId"]]), "pairs": pairs, "modelCalls": 0, "candidates": [control]}
    Path(args.out).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"controlCandidateId": control["candidateId"], "unsupportedTokens": src["unsupportedTokens"]}))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("evaluate"); e.add_argument("--cohort", required=True); e.add_argument("--out", required=True); e.set_defaults(fn=cmd_evaluate)
    n = sub.add_parser("negative-control"); n.add_argument("--cohort", required=True); n.add_argument("--faithfulness", required=True); n.add_argument("--out", required=True); n.set_defaults(fn=cmd_negative_control)
    r = sub.add_parser("replay"); r.add_argument("--cohort", required=True); r.add_argument("--evaluation", required=True); r.add_argument("--out", required=True); r.set_defaults(fn=cmd_replay)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
