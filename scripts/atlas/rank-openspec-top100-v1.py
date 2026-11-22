#!/usr/bin/env python3
"""
OpenSpec Crime Scene Reconstruction — Top 100 Quick-Hit Ranker (v1)

Parses all open (`- [ ]`) and partial (`- [~]`) tasks from
openspec/changes/crime-scene-reconstruction/tasks.md, scores each task on a
transparent 100-point Quick-Hit Rubric, and writes:
  - docs/reports/crime-scene-top100-quick-hits-v1.md
  - docs/reports/crime-scene-top100-quick-hits-v1.json
"""

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.topk_paginator import stable_topk
from atlas_compute.typed_graph_runtime import run_pagerank
from atlas_graph_runtime.contracts import TypedGraphEdge

TASKS_MD = REPO_ROOT / "openspec/changes/crime-scene-reconstruction/tasks.md"
ONTO_REC_JSON = REPO_ROOT / "docs/reports/scene-ontology-kmeans-pagerank-v1.json"
OUT_MD = REPO_ROOT / "docs/reports/crime-scene-top100-quick-hits-v1.md"
OUT_JSON = REPO_ROOT / "docs/reports/crime-scene-top100-quick-hits-v1.json"

TASK_LINE_RE = re.compile(r"^(\s*)-\s*\[([ ~xX])\]\s*(.+)$")
ID_RE = re.compile(r"\b([A-Z][A-Z0-9_-]{2,}(?:-[A-Za-z0-9]+)*)\b")


def score_task(status: str, text: str, line_no: int) -> dict:
    low = text.lower()

    # 1. Readiness / Existing Foundation (0..30)
    readiness = 0
    if status == "~":
        readiness += 22  # Partial: foundation already exists, just needs completion/proof
    if re.search(r"\b[a-z0-9_-]+\.(ts|svelte|py|sql|spec\.ts|test\.ts|glb)\b", text):
        readiness += 8

    # 2. Critical-Path Leverage / Priority (0..25)
    leverage = 5
    if any(tag in text for tag in ("P0", "SCENE-01", "SCENE-02", "SCENE-06", "SCENE-07", "SCENE-08", "CASE-SCENE-E2E-10", "CASE-SCENE-LIVE")):
        leverage = 25
    elif any(tag in text for tag in ("ENG-", "MEM-", "SCENE-0", "SCENE-1", "CASE-SCENE-")):
        leverage = 18
    elif any(k in low for k in ("persist", "save", "reopen", "auth", "hash", "drizzle", "playwright")):
        leverage = 15

    # 3. Low Infrastructure Friction (0..20)
    friction = 16
    heavy_gpu_or_external = ("qlora", "dawn", "avx-512", "cuvs", "rapids", "wan 3.0", "flux", "cuda", "libtorch", "trellis")
    if any(k in low for k in heavy_gpu_or_external):
        friction -= 12
    if any(k in low for k in ("colmap", "ffmpeg", "sam2", "depth anything", "comfyui")):
        friction -= 4
    if any(k in low for k in ("vitest", "unit", "zod", "schema", "typescript", "three.js", "playwright")):
        friction += 4
    friction = max(0, min(20, friction))

    # 4. Narrow Scope / Effort Size (0..15)
    scope = 10
    if len(text) < 220:
        scope += 3
    elif len(text) > 500:
        scope -= 4
    if any(k in low for k in ("end-to-end", "full corpus", "all ", "multi-scene", "isolated worker/browser")):
        scope -= 3
    scope = max(0, min(15, scope))

    # 5. Verification Clarity (0..10)
    clarity = 2
    if any(k in low for k in ("test:", "acceptance:", "spec:", "assert", "verify", "passed", "playwright")):
        clarity += 8
    elif any(k in low for k in ("check", "validate", "proof")):
        clarity += 4
    clarity = min(10, clarity)

    total = readiness + leverage + friction + scope + clarity
    return {
        "total": total,
        "readiness": readiness,
        "leverage": leverage,
        "friction": friction,
        "scope": scope,
        "clarity": clarity,
    }


def extract_task_id(text: str, line_no: int) -> str:
    clean = text.replace("**", "").strip()
    m = ID_RE.match(clean)
    if m:
        return m.group(1)
    return f"TASK-L{line_no}"


def load_ontology_pagerank_terms() -> list[tuple[str, float]]:
    if not ONTO_REC_JSON.exists():
        return []
    data = json.loads(ONTO_REC_JSON.read_text(encoding="utf-8"))
    terms: list[tuple[str, float]] = []
    for item in data.get("topRecommendations", []):
        cid = str(item.get("conceptId", ""))
        pr = float(item.get("pageRank", 0.0))
        tokens = [t for t in re.split(r"[._-]+", cid.lower()) if len(t) >= 4]
        if tokens and pr > 0:
            terms.append((tokens[-1], pr))
    return terms


def compute_task_pagerank(candidates: list[dict], raw_texts: list[str]) -> tuple[dict[int, float], dict]:
    ordinals = [c["candidateOrdinal"] for c in candidates]
    by_prefix: dict[str, list[int]] = {}
    id_to_ordinals: dict[str, list[int]] = {}

    for c in candidates:
        ord_id = c["candidateOrdinal"]
        tid = c["taskId"]
        prefix = tid.split("-")[0] if "-" in tid else "TASK"
        by_prefix.setdefault(prefix, []).append(ord_id)
        id_to_ordinals.setdefault(tid, []).append(ord_id)

    edges: list[TypedGraphEdge] = []
    seen_edges: set[tuple[int, int, str]] = set()

    def add_edge(src: int, dst: int, kind: str, weight: float = 1.0) -> None:
        if src == dst or (src, dst, kind) in seen_edges:
            return
        seen_edges.add((src, dst, kind))
        edges.append(TypedGraphEdge(src_ordinal=src, dst_ordinal=dst, kind=kind, weight=weight))

    # Sequential prefix links (earlier task -> later task in same subsystem)
    for group in by_prefix.values():
        for prev_ord, next_ord in zip(group, group[1:]):
            add_edge(next_ord, prev_ord, "SUBSYSTEM_DEPENDS_ON", 0.5)

    # Explicit cross-references to other task IDs in task description
    for c, text in zip(candidates, raw_texts):
        src = c["candidateOrdinal"]
        for ref_id in ID_RE.findall(text):
            if ref_id == c["taskId"]:
                continue
            for dst in id_to_ordinals.get(ref_id, []):
                add_edge(src, dst, "TEXT_REFERENCES_TASK", 1.0)

    pr_scores, receipt = run_pagerank(
        graph_revision="openspec:crime-scene-reconstruction:tasks-v1",
        node_ordinals=ordinals,
        edges=edges,
        backend="networkx",
    )
    receipt_dict = {
        "schema": receipt.schema,
        "operation": receipt.operation,
        "requestedBackend": receipt.requested_backend,
        "effectiveBackend": receipt.effective_backend,
        "graphRevision": receipt.graph_revision,
        "nodeCount": receipt.node_count,
        "edgeCount": receipt.edge_count,
        "status": receipt.status,
        "canonicalAuthority": receipt.canonical_authority,
        "error": receipt.error,
    }
    return pr_scores, receipt_dict


def main():
    lines = TASKS_MD.read_text(encoding="utf-8").splitlines()
    candidates = []
    raw_texts = []
    counts = {"total": 0, "done": 0, "partial": 0, "open": 0}
    onto_terms = load_ontology_pagerank_terms()

    for idx, line in enumerate(lines, start=1):
        m = TASK_LINE_RE.match(line)
        if not m:
            continue
        status = m.group(2)
        text = m.group(3).strip()
        counts["total"] += 1
        if status.lower() == "x":
            counts["done"] += 1
            continue
        elif status == "~":
            counts["partial"] += 1
        else:
            counts["open"] += 1

        scores = score_task(status, text, idx)
        task_id = extract_task_id(text, idx)
        summary = text.replace("**", "").replace("|", "/").strip()
        if len(summary) > 140:
            summary = summary[:137] + "..."

        ord_id = len(candidates)
        low = text.lower()
        onto_hits = sum(1 for tok, _ in onto_terms if tok in low)
        onto_boost = min(4.0, round(onto_hits * 1.0, 2))

        candidates.append({
            "candidateOrdinal": ord_id,
            "canonicalId": f"openspec:crime-scene-reconstruction:{task_id}#L{idx}",
            "line": idx,
            "taskId": task_id,
            "changeQualifiedKey": f"crime-scene-reconstruction/tasks.md#L{idx}",
            "scopedTaskId": f"openspec:crime-scene-reconstruction:{task_id}#L{idx}",
            "status": "PARTIAL" if status == "~" else "OPEN",
            "rubricScore": scores["total"],
            "ontologyBoost": onto_boost,
            "score": float(scores["total"]),
            "breakdown": scores,
            "summary": summary,
        })
        raw_texts.append(text)

    pr_scores, pr_receipt = compute_task_pagerank(candidates, raw_texts)
    max_pr = max(pr_scores.values(), default=0.0)
    for c in candidates:
        raw_pr = pr_scores.get(c["candidateOrdinal"], 0.0)
        norm_pr_boost = round((raw_pr / max_pr) * 8.0, 2) if max_pr > 0 else 0.0
        c["pagerankScore"] = round(raw_pr, 6)
        c["pagerankBoost"] = norm_pr_boost
        # Bounded 0..100 composite score (non-canonical advisory ranking)
        c["score"] = round(min(100.0, c["rubricScore"] + c["ontologyBoost"] + norm_pr_boost), 2)

    topk_result = stable_topk(candidates, k=100, offset=0)
    by_ordinal = {c["candidateOrdinal"]: c for c in candidates}
    top100 = [by_ordinal[r["candidateOrdinal"]] for r in topk_result["candidates"]]

    payload = {
        "schema": "atlas.openspec-top100-quick-hits.v1",
        "source": "openspec/changes/crime-scene-reconstruction/tasks.md",
        "canonicalAuthority": False,
        "topkSchema": topk_result["schema"],
        "topkOrder": topk_result["order"],
        "pagerankReceipt": pr_receipt,
        "counts": counts,
        "rubric": {
            "readiness": "0..30 (Partial [~] +22, cites existing file +8)",
            "leverage": "0..25 (P0/SCENE-01..08/CASE-SCENE-E2E-10 = 25, ENG/MEM = 18, auth/db/playwright = 15, else 5)",
            "lowFriction": "0..20 (Base 16, +4 TS/Vitest/Playwright/Three.js, -4 media/FFmpeg, -12 heavy GPU/C++/Dawn/QLoRA)",
            "narrowScope": "0..15 (Base 10, +3 concise <220 chars, -4 >500 chars, -3 multi-service/e2e)",
            "verificationClarity": "0..10 (Base 2, +8 explicit Test/Acceptance/Assert/Playwright, +4 check/validate)",
        },
        "top100": top100,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    md_lines = [
        "# Crime Scene Reconstruction — Top 100 Quick-Hit Tasks",
        "",
        f"- **Source**: `openspec/changes/crime-scene-reconstruction/tasks.md`",
        f"- **Census**: {counts['total']} total ({counts['done']} Done, {counts['partial']} Partial, {counts['open']} Open)",
        f"- **Ranked Candidates**: {len(candidates)} actionable (`PARTIAL` + `OPEN`) -> Top 100 listed below",
        "",
        "## Quick-Hit Ranking System (0–100 Points)",
        "",
        "| Dimension | Max Points | Scoring Criteria |",
        "| :--- | :---: | :--- |",
        "| **1. Readiness / Existing Foundation** | 30 | `[~]` Partial already exists (+22); references concrete `.ts`/`.svelte`/`.spec.ts`/`.sql` file (+8) |",
        "| **2. Critical-Path Leverage** | 25 | P0 / `SCENE-01..08` / `CASE-SCENE-E2E-10` (+25); `ENG-*`/`MEM-*`/`CASE-SCENE-*` (+18); auth/DB/Playwright (+15) |",
        "| **3. Low Infra Friction** | 20 | Base 16; +4 for local TS/Vitest/Three.js/Playwright; -4 for FFmpeg/depth workers; -12 for CUDA/cuVS/Dawn/QLoRA/AVX-512 |",
        "| **4. Narrow Scope** | 15 | Base 10; +3 concise single-unit task (<220 chars); -4 broad (>500 chars); -3 full multi-service E2E |",
        "| **5. Verification Clarity** | 10 | Base 2; +8 explicit `Test:`/`Acceptance:`/`Assert`/`Playwright`; +4 `check`/`validate`/`proof` |",
        "",
        "## Top 100 Quick-Hit List",
        "",
        "| Rank | Score | Status | Line | Task ID | Summary |",
        "| :---: | :---: | :---: | :---: | :--- | :--- |",
    ]
    for rank, item in enumerate(top100, start=1):
        md_lines.append(
            f"| {rank} | **{item['score']}** | {item['status']} | L{item['line']} | `{item['taskId']}` | {item['summary']} |"
        )

    OUT_MD.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    print(f"Ranked {len(candidates)} actionable tasks. Wrote Top 100 to {OUT_MD} and {OUT_JSON}")
    print("Top 10 preview:")
    for i, item in enumerate(top100[:10], 1):
        print(f"  #{i:2d} [{item['score']:5.1f}] ({item['status']:7s} L{item['line']}) {item['taskId']}: {item['summary'][:80]}")


if __name__ == "__main__":
    main()
