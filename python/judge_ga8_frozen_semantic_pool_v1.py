"""GA8-JUDGE-01 judging phase over immutable semantic candidate pools.

No SQL, Qdrant, embedding, or graph reads occur here. Two seeded anonymous batch passes assign
0..3 grades. Any disagreement/parse miss gets one independent pointwise adjudication call; a
final grade is accepted only when at least two observed grades agree. Unresolved rows remain
explicit and block that query from the strict offline proof.

canonical_authority: false
human_gold_relevance_set_proven: false
"""
from __future__ import annotations

import hashlib
import json
import os
import random
from pathlib import Path
from typing import Any

import requests

from ga8_judge_v2_common import canonical_json, load_ndjson, sha256_json, sha256_text, write_ndjson

LLAMA_URL = os.getenv("GA8_JUDGE_URL", "http://127.0.0.1:8090").rstrip("/")
JUDGE_MODEL = os.getenv("GA8_JUDGE_MODEL", "ornith-1.5-9b")
JUDGE_MODEL_REVISION = os.getenv("GA8_JUDGE_MODEL_REVISION")
FROZEN_POOL_PATH = os.getenv("GA8_FROZEN_POOL_PATH", ".tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson")
OUT_PATH = os.getenv("GA8_JUDGMENT_PATH", ".tmp/atlas/ga8-llm-judged-semantic-relevance-v2.ndjson")
REPORT_PATH = os.getenv("GA8_JUDGMENT_REPORT", "docs/reports/ga8-llm-judged-semantic-relevance-v2.json")
BATCH_SIZE = int(os.getenv("GA8_JUDGE_BATCH_SIZE", "8"))
MAX_TOKENS = int(os.getenv("GA8_JUDGE_MAX_TOKENS", "3000"))
PRESENTATION_SEED = int(os.getenv("GA8_JUDGE_PRESENTATION_SEED", "99173"))
EVIDENCE_TRUNCATE = int(os.getenv("GA8_JUDGE_EVIDENCE_CHARS", "700"))
PROMPT_REVISION = "ga8-llm-judge-graded-v2"
PRESENTATION_POLICY_REVISION = "two-pass-plus-pointwise-adjudication-v1"

RUBRIC = (
    "0 = not relevant; 1 = related/background only and would not materially help; "
    "2 = relevant and useful evidence/context; 3 = highly relevant and directly useful"
)
BATCH_PROMPT_TEMPLATE = """You are grading code-retrieval relevance.
QUERY:\n{query}\n
Candidates are anonymous. Judge ONLY supplied evidence text. Do not infer path, graph structure,
imports, popularity, PageRank, retrieval score, or rank.
Rubric: {rubric}.
Return exactly JSON: {{"judgments":[{{"slot":"S0","grade":0}}]}} with one grade per slot.
CANDIDATES:\n{candidates}
"""
POINT_PROMPT_TEMPLATE = """You are adjudicating one code-retrieval relevance judgment.
QUERY:\n{query}\n
ANONYMOUS CANDIDATE EVIDENCE:\n{evidence}\n
Judge ONLY supplied text. Rubric: {rubric}.
Return exactly JSON: {{"grade":0}} where grade is 0,1,2,or 3.
"""
PROMPT_CHECKSUM = sha256_text(BATCH_PROMPT_TEMPLATE + "\0" + POINT_PROMPT_TEMPLATE + "\0" + RUBRIC)
PRESENTATION_POLICY = {
    "revision": PRESENTATION_POLICY_REVISION,
    "batchPasses": 2,
    "pointwiseAdjudicationForUnstable": True,
    "batchSize": BATCH_SIZE,
    "presentationSeed": PRESENTATION_SEED,
    "evidenceChars": EVIDENCE_TRUNCATE,
    "maxTokens": MAX_TOKENS,
    "temperature": 0,
    "anonymousSlots": True,
}
PRESENTATION_POLICY_CHECKSUM = sha256_json(PRESENTATION_POLICY)


def pool_checksum_payload(pool: dict[str, Any]) -> dict[str, Any]:
    return {
        "queryId": pool["queryId"], "queryText": pool["queryText"],
        "queryTextChecksum": pool["queryTextChecksum"], "queryEmbeddingChecksum": pool["queryEmbeddingChecksum"],
        "representationId": pool["representationId"], "embeddingModelRevision": pool["embeddingModelRevision"],
        "poolK": pool["poolK"], "candidates": pool["candidates"],
    }


def validate_pool(pool: dict[str, Any]) -> None:
    if pool.get("schema") != "atlas.frozen-semantic-candidate-pool.v1": raise SystemExit("GA8_FROZEN_POOL_SCHEMA_MISMATCH")
    if int(pool.get("labelInputsUsed", -1)) != 0 or int(pool.get("graphInputsUsed", -1)) != 0: raise SystemExit("GA8_FROZEN_POOL_TAINTED")
    if pool.get("canonicalAuthority") is not False: raise SystemExit("GA8_FROZEN_POOL_AUTHORITY_INVALID")
    if sha256_text(str(pool.get("queryText", ""))) != pool.get("queryTextChecksum"): raise SystemExit("GA8_QUERY_TEXT_CHECKSUM_MISMATCH")
    candidates = list(pool.get("candidates") or [])
    ids = [str(c.get("candidateId")) for c in candidates]
    if len(ids) != len(set(ids)): raise SystemExit("GA8_FROZEN_POOL_DUPLICATE_CANDIDATE")
    if [int(c.get("poolOrdinal", -1)) for c in candidates] != list(range(len(candidates))): raise SystemExit("GA8_FROZEN_POOL_ORDINAL_GAP")
    for c in candidates:
        if sha256_text(str(c.get("evidenceText") or "")) != c.get("evidenceTextChecksum"):
            raise SystemExit(f"GA8_EVIDENCE_TEXT_CHECKSUM_MISMATCH:{pool.get('queryId')}:{c.get('candidateId')}")
    if sha256_json(pool_checksum_payload(pool)) != pool.get("candidatePoolChecksum"):
        raise SystemExit(f"GA8_CANDIDATE_POOL_CHECKSUM_MISMATCH:{pool.get('queryId')}")


def deterministic_seed(query_id: str, pass_no: int) -> int:
    digest = hashlib.sha256(f"{PRESENTATION_SEED}\0{query_id}\0{pass_no}".encode()).digest()
    return int.from_bytes(digest[:8], "little")


def llama_chat(prompt: str) -> str:
    payload = {"model": JUDGE_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0, "max_tokens": MAX_TOKENS, "stream": True}
    response = requests.post(f"{LLAMA_URL}/v1/chat/completions", json=payload, stream=True, timeout=240)
    response.raise_for_status()
    assembled = ""
    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"): continue
        data = line[5:].strip()
        if data == "[DONE]": break
        try: assembled += json.loads(data)["choices"][0]["delta"].get("content", "")
        except Exception: continue
    return assembled.strip()


def parse_json_object(text: str) -> dict[str, Any]:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start: raise ValueError("JUDGE_JSON_OBJECT_NOT_FOUND")
    try: payload = json.loads(text[start:end + 1])
    except json.JSONDecodeError as exc: raise ValueError("JUDGE_JSON_PARSE_FAILED") from exc
    if not isinstance(payload, dict): raise ValueError("JUDGE_JSON_NOT_OBJECT")
    return payload


def valid_grade(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value: raise ValueError("JUDGE_GRADE_NOT_INTEGER")
    grade = int(value)
    if grade < 0 or grade > 3: raise ValueError("JUDGE_GRADE_OUT_OF_RANGE")
    return grade


def parse_batch(text: str, expected_slots: list[str]) -> dict[str, int]:
    judgments = parse_json_object(text).get("judgments")
    if not isinstance(judgments, list): raise ValueError("JUDGE_JUDGMENTS_NOT_ARRAY")
    result: dict[str, int] = {}
    for item in judgments:
        if not isinstance(item, dict): raise ValueError("JUDGE_ITEM_NOT_OBJECT")
        slot = item.get("slot")
        if slot not in expected_slots or slot in result: raise ValueError("JUDGE_SLOT_INVALID_OR_DUPLICATE")
        result[str(slot)] = valid_grade(item.get("grade"))
    if set(result) != set(expected_slots): raise ValueError("JUDGE_SLOT_SET_MISMATCH")
    return result


def judge_query_pass(pool: dict[str, Any], pass_no: int) -> tuple[dict[str, int], list[dict[str, Any]]]:
    candidates = list(pool["candidates"])
    random.Random(deterministic_seed(str(pool["queryId"]), pass_no)).shuffle(candidates)
    grades: dict[str, int] = {}; failures: list[dict[str, Any]] = []
    for batch_start in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[batch_start:batch_start + BATCH_SIZE]
        slots: dict[str, dict[str, Any]] = {}; lines: list[str] = []
        for i, c in enumerate(batch):
            slot = f"S{i}"; slots[slot] = c
            evidence = str(c.get("evidenceText") or "").strip().replace("\n", " ")[:EVIDENCE_TRUNCATE]
            lines.append(f"{slot}: {evidence or '(no evidence text)'}")
        raw = llama_chat(BATCH_PROMPT_TEMPLATE.format(query=str(pool["queryText"])[:2000], rubric=RUBRIC, candidates="\n".join(lines)))
        try: parsed = parse_batch(raw, list(slots))
        except ValueError as exc:
            failures.append({"pass": pass_no, "batchStart": batch_start, "candidateIds": [str(c["candidateId"]) for c in batch], "error": str(exc), "rawOutputChecksum": sha256_text(raw)})
            continue
        for slot, grade in parsed.items(): grades[str(slots[slot]["candidateId"])] = grade
    return grades, failures


def adjudicate(pool: dict[str, Any], candidate: dict[str, Any]) -> tuple[int | None, dict[str, Any] | None]:
    evidence = str(candidate.get("evidenceText") or "").strip().replace("\n", " ")[:EVIDENCE_TRUNCATE]
    raw = llama_chat(POINT_PROMPT_TEMPLATE.format(query=str(pool["queryText"])[:2000], evidence=evidence or "(no evidence text)", rubric=RUBRIC))
    try: return valid_grade(parse_json_object(raw).get("grade")), None
    except ValueError as exc:
        return None, {"candidateId": str(candidate["candidateId"]), "error": str(exc), "rawOutputChecksum": sha256_text(raw)}


def majority_grade(grades: list[int | None]) -> int | None:
    observed = [g for g in grades if g is not None]
    for grade in range(4):
        if observed.count(grade) >= 2: return grade
    return None


def main() -> None:
    if not JUDGE_MODEL_REVISION: raise SystemExit("GA8_JUDGE_MODEL_REVISION_REQUIRED")
    if BATCH_SIZE <= 0 or MAX_TOKENS <= 0 or EVIDENCE_TRUNCATE <= 0: raise SystemExit("GA8_JUDGE_CONFIG_INVALID")
    pools = load_ndjson(FROZEN_POOL_PATH)
    if not pools: raise SystemExit("GA8_FROZEN_POOL_EMPTY")
    if len({str(p.get("queryId")) for p in pools}) != len(pools): raise SystemExit("GA8_DUPLICATE_QUERY_ID")
    for pool in pools: validate_pool(pool)

    snapshot_revisions = {str(p.get("candidateSnapshotRevision")) for p in pools}
    if len(snapshot_revisions) != 1 or "None" in snapshot_revisions: raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MIXED_OR_MISSING")
    candidate_snapshot_revision = next(iter(snapshot_revisions))
    expected_snapshot = sha256_json([{"queryId": p["queryId"], "candidatePoolChecksum": p["candidatePoolChecksum"]} for p in pools])
    if candidate_snapshot_revision != expected_snapshot: raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MISMATCH")

    universe_payload = [{"queryId": p["queryId"], "candidatePoolChecksum": p["candidatePoolChecksum"], "judgePromptChecksum": PROMPT_CHECKSUM,
                         "judgeModelRevision": JUDGE_MODEL_REVISION, "presentationPolicyChecksum": PRESENTATION_POLICY_CHECKSUM} for p in pools]
    universe_checksum = sha256_json(universe_payload)

    rows: list[dict[str, Any]] = []; failures: list[dict[str, Any]] = []
    replay_stable = adjudicated = unresolved = 0
    for q_index, pool in enumerate(pools):
        pass1, f1 = judge_query_pass(pool, 1); pass2, f2 = judge_query_pass(pool, 2)
        failures.extend({"queryId": pool["queryId"], **x} for x in f1 + f2)
        query_universe_checksum = sha256_json({"queryId": pool["queryId"], "candidatePoolChecksum": pool["candidatePoolChecksum"],
            "judgePromptChecksum": PROMPT_CHECKSUM, "judgeModelRevision": JUDGE_MODEL_REVISION, "presentationPolicyChecksum": PRESENTATION_POLICY_CHECKSUM})
        for candidate in pool["candidates"]:
            cid = str(candidate["candidateId"]); g1, g2 = pass1.get(cid), pass2.get(cid)
            g3: int | None = None; adjudication_failure = None
            if g1 is None or g2 is None or g1 != g2:
                g3, adjudication_failure = adjudicate(pool, candidate)
                if adjudication_failure: failures.append({"queryId": pool["queryId"], "adjudication": True, **adjudication_failure})
            final_grade = g1 if g1 is not None and g1 == g2 else majority_grade([g1, g2, g3])
            if g1 is not None and g1 == g2: resolution = "TWO_PASS_REPLAY_STABLE"; replay_stable += 1
            elif final_grade is not None: resolution = "POINTWISE_ADJUDICATED_MAJORITY"; adjudicated += 1
            else: resolution = "UNRESOLVED"; unresolved += 1
            rows.append({
                "schema": "atlas.llm-judged-semantic-relevance.v2", "queryId": pool["queryId"], "candidateId": cid,
                "sourceRef": candidate["sourceRef"], "candidatePoolChecksum": pool["candidatePoolChecksum"],
                "candidateSnapshotRevision": candidate_snapshot_revision, "relevanceGrade": final_grade,
                "pass1Grade": g1, "pass2Grade": g2, "adjudicationGrade": g3, "resolved": final_grade is not None,
                "resolution": resolution, "judgeModel": JUDGE_MODEL, "judgeModelRevision": JUDGE_MODEL_REVISION,
                "judgePromptRevision": PROMPT_REVISION, "judgePromptChecksum": PROMPT_CHECKSUM,
                "presentationPolicyRevision": PRESENTATION_POLICY_REVISION, "presentationPolicyChecksum": PRESENTATION_POLICY_CHECKSUM,
                "queryJudgmentUniverseChecksum": query_universe_checksum, "judgmentUniverseChecksum": universe_checksum,
                "humanReviewed": False, "canonicalAuthority": False,
            })
        print(canonical_json({"event": "ga8_judge_progress", "queriesCompleted": q_index + 1, "queriesTotal": len(pools)}))

    expected_rows = sum(len(p["candidates"]) for p in pools)
    if len(rows) != expected_rows: raise SystemExit("GA8_JUDGMENT_ROW_COVERAGE_MISMATCH")
    write_ndjson(OUT_PATH, rows)
    report = {
        "schema": "atlas.ga8-llm-judged-semantic-relevance-receipt.v2", "status": "LLM_SILVER_LABELS_CREATED",
        "evidenceTier": "LLM_JUDGED_PROXY", "humanGoldRelevanceSetProven": False,
        "candidateSnapshotRevision": candidate_snapshot_revision, "frozenPoolPath": FROZEN_POOL_PATH, "judgmentPath": OUT_PATH,
        "judgmentUniverseChecksum": universe_checksum, "artifactChecksum": sha256_json(rows), "judgeModel": JUDGE_MODEL,
        "judgeModelRevision": JUDGE_MODEL_REVISION, "judgePromptRevision": PROMPT_REVISION, "judgePromptChecksum": PROMPT_CHECKSUM,
        "presentationPolicy": PRESENTATION_POLICY, "presentationPolicyChecksum": PRESENTATION_POLICY_CHECKSUM,
        "candidateRowsExpected": expected_rows, "candidateRows": len(rows), "twoPassReplayStableRows": replay_stable,
        "pointwiseAdjudicatedRows": adjudicated, "unresolvedRows": unresolved, "parseFailureEvents": len(failures),
        "parseFailures": failures, "canonicalAuthority": False,
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(canonical_json(report))


if __name__ == "__main__": main()
