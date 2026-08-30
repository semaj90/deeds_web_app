"""GA8-JUDGE-01 judging phase over an immutable semantic candidate pool.

No SQL, no Qdrant, no embedding calls, no graph reads, and no candidate discovery occur here.
The judge sees query text plus anonymous bounded candidate evidence only. It assigns 0..3 grades
in two deterministic presentation passes; disagreement is recorded, never silently averaged.

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
PRESENTATION_POLICY_REVISION = "two-pass-seeded-anonymous-batches-v1"

RUBRIC = (
    "0 = not relevant; "
    "1 = related/background only and would not materially help answer or fix the task; "
    "2 = relevant and useful evidence/context; "
    "3 = highly relevant and directly useful to the task"
)

PROMPT_TEMPLATE = """You are grading code-retrieval relevance.

QUERY:
{query}

Candidates below are intentionally anonymous. Judge ONLY the supplied evidence text. Do not infer
file paths, graph structure, import relationships, popularity, PageRank, retrieval score, or rank.

Rubric: {rubric}.

Return exactly one grade for every slot as JSON with this shape:
{{"judgments":[{{"slot":"S0","grade":0}},{{"slot":"S1","grade":2}}]}}
No prose, no missing slots, no extra slots.

CANDIDATES:
{candidates}
"""
PROMPT_CHECKSUM = sha256_text(PROMPT_TEMPLATE + "\0" + RUBRIC)


def deterministic_seed(query_id: str, pass_no: int) -> int:
    digest = hashlib.sha256(f"{PRESENTATION_SEED}\0{query_id}\0{pass_no}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "little", signed=False)


def llama_chat(prompt: str) -> str:
    payload = {
        "model": JUDGE_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": MAX_TOKENS,
        "stream": True,
    }
    response = requests.post(
        f"{LLAMA_URL}/v1/chat/completions",
        json=payload,
        stream=True,
        timeout=240,
    )
    response.raise_for_status()
    assembled = ""
    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        try:
            obj = json.loads(data)
            assembled += obj["choices"][0]["delta"].get("content", "")
        except Exception:
            continue
    return assembled.strip()


def parse_batch(text: str, expected_slots: list[str]) -> dict[str, int]:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("JUDGE_JSON_OBJECT_NOT_FOUND")
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError("JUDGE_JSON_PARSE_FAILED") from exc
    judgments = payload.get("judgments") if isinstance(payload, dict) else None
    if not isinstance(judgments, list):
        raise ValueError("JUDGE_JUDGMENTS_NOT_ARRAY")
    result: dict[str, int] = {}
    for item in judgments:
        if not isinstance(item, dict):
            raise ValueError("JUDGE_ITEM_NOT_OBJECT")
        slot = item.get("slot")
        grade = item.get("grade")
        if slot not in expected_slots or slot in result:
            raise ValueError("JUDGE_SLOT_INVALID_OR_DUPLICATE")
        if isinstance(grade, bool) or not isinstance(grade, (int, float)) or int(grade) != grade:
            raise ValueError("JUDGE_GRADE_NOT_INTEGER")
        grade_int = int(grade)
        if grade_int < 0 or grade_int > 3:
            raise ValueError("JUDGE_GRADE_OUT_OF_RANGE")
        result[str(slot)] = grade_int
    if set(result) != set(expected_slots):
        raise ValueError("JUDGE_SLOT_SET_MISMATCH")
    return result


def judge_query_pass(pool: dict[str, Any], pass_no: int) -> tuple[dict[str, int], list[dict[str, Any]]]:
    candidates = list(pool["candidates"])
    rng = random.Random(deterministic_seed(str(pool["queryId"]), pass_no))
    rng.shuffle(candidates)

    grades: dict[str, int] = {}
    failures: list[dict[str, Any]] = []
    for batch_index in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[batch_index : batch_index + BATCH_SIZE]
        slot_to_candidate: dict[str, dict[str, Any]] = {}
        lines: list[str] = []
        for slot_index, candidate in enumerate(batch):
            slot = f"S{slot_index}"
            slot_to_candidate[slot] = candidate
            evidence = str(candidate.get("evidenceText") or "").strip().replace("\n", " ")[:EVIDENCE_TRUNCATE]
            lines.append(f"{slot}: {evidence or '(no evidence text)'}")
        prompt = PROMPT_TEMPLATE.format(
            query=str(pool["queryText"])[:2000],
            rubric=RUBRIC,
            candidates="\n".join(lines),
        )
        raw = llama_chat(prompt)
        try:
            parsed = parse_batch(raw, list(slot_to_candidate))
        except ValueError as exc:
            failures.append({
                "pass": pass_no,
                "batchStart": batch_index,
                "candidateIds": [str(c["candidateId"]) for c in batch],
                "error": str(exc),
                "rawOutputChecksum": sha256_text(raw),
            })
            continue
        for slot, grade in parsed.items():
            candidate_id = str(slot_to_candidate[slot]["candidateId"])
            grades[candidate_id] = grade
    return grades, failures


def main() -> None:
    if not JUDGE_MODEL_REVISION:
        raise SystemExit("GA8_JUDGE_MODEL_REVISION_REQUIRED")
    if BATCH_SIZE <= 0:
        raise SystemExit("GA8_JUDGE_BATCH_SIZE_INVALID")

    pools = load_ndjson(FROZEN_POOL_PATH)
    if not pools:
        raise SystemExit("GA8_FROZEN_POOL_EMPTY")
    for pool in pools:
        if pool.get("schema") != "atlas.frozen-semantic-candidate-pool.v1":
            raise SystemExit("GA8_FROZEN_POOL_SCHEMA_MISMATCH")
        if int(pool.get("labelInputsUsed", -1)) != 0 or int(pool.get("graphInputsUsed", -1)) != 0:
            raise SystemExit("GA8_FROZEN_POOL_NOT_LABEL_GRAPH_INDEPENDENT")

    global_universe_payload = [
        {
            "queryId": pool["queryId"],
            "candidatePoolChecksum": pool["candidatePoolChecksum"],
            "judgePromptChecksum": PROMPT_CHECKSUM,
            "judgeModelRevision": JUDGE_MODEL_REVISION,
            "presentationPolicyRevision": PRESENTATION_POLICY_REVISION,
        }
        for pool in pools
    ]
    judgment_universe_checksum = sha256_json(global_universe_payload)

    rows: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    stable_count = 0
    disagreement_count = 0
    high_disagreement_count = 0
    ungraded_count = 0

    for query_index, pool in enumerate(pools):
        pass1, failures1 = judge_query_pass(pool, 1)
        pass2, failures2 = judge_query_pass(pool, 2)
        failures.extend({"queryId": pool["queryId"], **item} for item in failures1 + failures2)
        query_universe_checksum = sha256_json({
            "queryId": pool["queryId"],
            "candidatePoolChecksum": pool["candidatePoolChecksum"],
            "judgePromptChecksum": PROMPT_CHECKSUM,
            "judgeModelRevision": JUDGE_MODEL_REVISION,
            "presentationPolicyRevision": PRESENTATION_POLICY_REVISION,
        })
        for candidate in pool["candidates"]:
            candidate_id = str(candidate["candidateId"])
            grade1 = pass1.get(candidate_id)
            grade2 = pass2.get(candidate_id)
            stable = grade1 is not None and grade2 is not None and grade1 == grade2
            disagreement: str | None = None
            if grade1 is None or grade2 is None:
                disagreement = "JUDGE_UNGRADED_PARSE_FAILURE"
                ungraded_count += 1
            elif grade1 != grade2:
                delta = abs(grade1 - grade2)
                disagreement = "JUDGE_DISAGREEMENT" if delta == 1 else "JUDGE_HIGH_DISAGREEMENT"
                disagreement_count += 1
                if delta > 1:
                    high_disagreement_count += 1
            else:
                stable_count += 1
            rows.append({
                "schema": "atlas.llm-judged-semantic-relevance.v2",
                "queryId": pool["queryId"],
                "candidateId": candidate_id,
                "sourceRef": candidate["sourceRef"],
                "candidatePoolChecksum": pool["candidatePoolChecksum"],
                "candidateSnapshotRevision": pool["candidateSnapshotRevision"],
                "relevanceGrade": grade1 if stable else None,
                "pass1Grade": grade1,
                "pass2Grade": grade2,
                "stable": stable,
                "disagreement": disagreement,
                "judgeModel": JUDGE_MODEL,
                "judgeModelRevision": JUDGE_MODEL_REVISION,
                "judgePromptRevision": PROMPT_REVISION,
                "judgePromptChecksum": PROMPT_CHECKSUM,
                "presentationPolicyRevision": PRESENTATION_POLICY_REVISION,
                "queryJudgmentUniverseChecksum": query_universe_checksum,
                "judgmentUniverseChecksum": judgment_universe_checksum,
                "humanReviewed": False,
                "canonicalAuthority": False,
            })
        print(canonical_json({"event": "ga8_judge_progress", "queriesCompleted": query_index + 1, "queriesTotal": len(pools)}))

    write_ndjson(OUT_PATH, rows)
    report = {
        "schema": "atlas.ga8-llm-judged-semantic-relevance-receipt.v2",
        "status": "LLM_SILVER_LABELS_CREATED",
        "evidenceTier": "LLM_JUDGED_PROXY",
        "humanGoldRelevanceSetProven": False,
        "frozenPoolPath": FROZEN_POOL_PATH,
        "judgmentPath": OUT_PATH,
        "judgmentUniverseChecksum": judgment_universe_checksum,
        "artifactChecksum": sha256_json(rows),
        "judgeModel": JUDGE_MODEL,
        "judgeModelRevision": JUDGE_MODEL_REVISION,
        "judgePromptRevision": PROMPT_REVISION,
        "judgePromptChecksum": PROMPT_CHECKSUM,
        "presentationPolicyRevision": PRESENTATION_POLICY_REVISION,
        "candidateRows": len(rows),
        "stableRows": stable_count,
        "disagreementRows": disagreement_count,
        "highDisagreementRows": high_disagreement_count,
        "ungradedRows": ungraded_count,
        "parseFailureBatches": len(failures),
        "parseFailures": failures,
        "canonicalAuthority": False,
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(canonical_json(report))


if __name__ == "__main__":
    main()
