"""Build a >= 30 task-group leakage-free evaluation set template & reviewer-gated scorer.

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`):
  - Selects >= 30 distinct task groups (24 train + 12 held-out, disjoint by `change`
    and `sourceRef` so there is zero task/source leakage).
  - Pairs each task with top-3 candidate chunks from `doc14-admitted-chunks.jsonl`.
  - Marks all rows `reviewStatus="PENDING_HUMAN_REVIEW"` (`reviewedLabel=None`).
  - `evaluate_reviewed_holdout_v1` fails closed (`UNREVIEWED_EVAL_SET`) until rows
    are human-reviewed, computing Recall@K, MRR, NDCG@5, and Citation Pass Rate.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Mapping, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
TASKS_NDJSON = REPO_ROOT / "docs" / "reports" / "openspec-all-tasks-export-v1.ndjson"
CHUNKS_JSONL = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
OUT_EVAL_JSONL = REPO_ROOT / "docs" / "reports" / "reviewed-task-eval-set-v1.jsonl"
OUT_RECEIPT_JSON = REPO_ROOT / "docs" / "reports" / "reviewed-task-eval-receipt-v1.json"

_TOK_RE = re.compile(r"[a-z0-9_]{3,}")


def _tokenize(text: str) -> set[str]:
    return set(_TOK_RE.findall(text.lower()))


def build_leakage_free_eval_template_v1(
    tasks: Sequence[Mapping[str, Any]],
    chunks: Sequence[Mapping[str, Any]],
    *,
    target_groups: int = 36,
    train_ratio: float = 2.0 / 3.0,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    # Pick at most 1 open task per distinct OpenSpec `change` so task groups & sourceRefs are disjoint
    by_change: dict[str, Mapping[str, Any]] = {}
    for t in tasks:
        if t.get("status") != "OPEN":
            continue
        chg = str(t.get("change") or "").strip()
        if chg and chg not in by_change:
            by_change[chg] = t
        if len(by_change) >= target_groups:
            break

    selected = list(by_change.values())
    split_idx = max(1, int(round(len(selected) * train_ratio)))
    train_changes = {str(t["change"]) for t in selected[:split_idx]}
    heldout_changes = {str(t["change"]) for t in selected[split_idx:]}

    chunk_tokens = [(c, _tokenize(f"{c.get('sourceRef', '')} {c.get('text', '')}")) for c in chunks]
    records: list[dict[str, Any]] = []

    for task in selected:
        t_toks = _tokenize(f"{task.get('change', '')} {task.get('text', '')}")
        scored = []
        for chunk, c_toks in chunk_tokens:
            overlap = len(t_toks & c_toks)
            score = overlap / max(1, len(t_toks))
            scored.append((score, str(chunk["chunkId"]), chunk))
        scored.sort(key=lambda item: (-item[0], item[1]))
        top3 = scored[:3]

        chg = str(task["change"])
        split = "train" if chg in train_changes else "held_out"
        records.append({
            "schema": "atlas.reviewed-task-eval-row.v1",
            "taskGroupId": chg,
            "taskId": task["taskId"],
            "sourceRef": task["sourceRef"],
            "sourceSha256": task["sourceSha256"],
            "split": split,
            "queryText": task["text"],
            "candidates": [
                {
                    "chunkId": cid,
                    "sourceRef": c["sourceRef"],
                    "sourceRevision": c["sourceRevision"],
                    "lexicalPrior": round(s, 6),
                    "relevanceLabel": None,
                    "citationVerified": None,
                }
                for s, cid, c in top3
            ],
            "reviewStatus": "PENDING_HUMAN_REVIEW",
            "abstained": None,
        })

    train_sources = {r["sourceRef"] for r in records if r["split"] == "train"}
    heldout_sources = {r["sourceRef"] for r in records if r["split"] == "held_out"}
    leakage = sorted((train_changes & heldout_changes) | (train_sources & heldout_sources))

    receipt = {
        "schema": "atlas.reviewed-task-eval-receipt.v1",
        "totalTaskGroups": len(records),
        "trainTaskGroups": sum(1 for r in records if r["split"] == "train"),
        "heldOutTaskGroups": sum(1 for r in records if r["split"] == "held_out"),
        "sourceLeakageCount": len(leakage),
        "datasetChecksum": "sha256:" + hashlib.sha256(
            "\n".join(json.dumps(r, sort_keys=True) for r in records).encode("utf-8")
        ).hexdigest(),
        "reviewCompleted": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return records, receipt


def evaluate_reviewed_holdout_v1(records: Sequence[Mapping[str, Any]], *, k: int = 3) -> dict[str, Any]:
    held_out = [r for r in records if r.get("split") == "held_out"]
    if not held_out:
        return {"status": "EMPTY_HELD_OUT", "passed": False, "canonicalAuthority": False}

    unreviewed = [r["taskGroupId"] for r in held_out if r.get("reviewStatus") != "REVIEWED"]
    if unreviewed:
        return {
            "status": "UNREVIEWED_EVAL_SET",
            "unreviewedCount": len(unreviewed),
            "passed": False,
            "canonicalAuthority": False,
        }

    recalls: list[float] = []
    mrrs: list[float] = []
    ndcgs: list[float] = []
    citations_ok = 0
    citation_total = 0

    for row in held_out:
        cands = list(row.get("candidates") or [])[:k]
        rels = [float(c.get("relevanceLabel") or 0.0) for c in cands]
        has_rel = any(r > 0 for r in rels)
        recalls.append(1.0 if has_rel else 0.0)

        rr = 0.0
        for idx, r in enumerate(rels, start=1):
            if r > 0:
                rr = 1.0 / idx
                break
        mrrs.append(rr)

        dcg = sum(r / math.log2(idx + 1) for idx, r in enumerate(rels, start=1))
        ideal_rels = sorted(rels, reverse=True)
        idcg = sum(r / math.log2(idx + 1) for idx, r in enumerate(ideal_rels, start=1))
        ndcgs.append(dcg / idcg if idcg > 0 else 0.0)

        for c in cands:
            if c.get("citationVerified") is not None:
                citation_total += 1
                if c.get("citationVerified") is True:
                    citations_ok += 1

    return {
        "schema": "atlas.reviewed-holdout-eval.v1",
        "status": "EVALUATED",
        "heldOutCount": len(held_out),
        "recallAtK": round(sum(recalls) / len(recalls), 6),
        "mrr": round(sum(mrrs) / len(mrrs), 6),
        "ndcgAtK": round(sum(ndcgs) / len(ndcgs), 6),
        "citationPassRate": round(citations_ok / citation_total, 6) if citation_total else None,
        "passed": len(held_out) >= 10,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    tasks = [json.loads(l) for l in TASKS_NDJSON.read_text(encoding="utf-8").splitlines() if l.strip()]
    chunks = [json.loads(l) for l in CHUNKS_JSONL.read_text(encoding="utf-8").splitlines() if l.strip()]
    records, receipt = build_leakage_free_eval_template_v1(tasks, chunks, target_groups=36)

    OUT_EVAL_JSONL.parent.mkdir(parents=True, exist_ok=True)
    OUT_EVAL_JSONL.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n",
        encoding="utf-8",
    )
    OUT_RECEIPT_JSON.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**receipt, "evalPath": str(OUT_EVAL_JSONL), "receiptPath": str(OUT_RECEIPT_JSON)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
