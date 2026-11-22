#!/usr/bin/env python3
"""
Read-only 14.8k OpenSpec Task Triage Classifier (v1)

Scans all `openspec/changes/*/tasks.md` files, assigns durable
`<change>:<bareId>:<ordinal>` keys (keeping `#Lnn` as locator only),
and classifies open/partial tasks into 4 GAN-safe buckets:
  1. DONE (already checked `[x]`)
  2. CODE_ONLY_TESTABLE (local TS/Svelte/Python + unit/Vitest/pytest verifiable)
  3. PROOF_PENDING (`[~]` partial or requires Playwright/readback/parity proof)
  4. APPROVAL_OR_DB_GATED (Postgres/SeaweedFS/Docker/migration/operator secret)
  5. PHASE20_OR_GPU_BLOCKED (Phase 20 source_revision, Graphify, Valkey warming, CUDA/cuVS/cuTile/QLoRA)

Output:
  - docs/reports/openspec-task-triage-v1.json
  - docs/reports/openspec-task-triage-v1.md

Never modifies OpenSpec files, Postgres, Qdrant, or Redis.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.topk_paginator import stable_topk

CHANGES_DIR = REPO_ROOT / "openspec" / "changes"
OUT_JSON = REPO_ROOT / "docs" / "reports" / "openspec-task-triage-v1.json"
OUT_MD = REPO_ROOT / "docs" / "reports" / "openspec-task-triage-v1.md"

TASK_LINE_RE = re.compile(r"^\s*-\s*\[([ ~xX])\]\s*(.+)$")
ID_RE = re.compile(r"\b([A-Z][A-Z0-9_-]{2,}(?:-[A-Za-z0-9]+)*)\b")


def extract_bare_id(text: str, line_no: int) -> str:
    clean = text.replace("**", "").strip()
    m = ID_RE.match(clean)
    return m.group(1) if m else f"TASK-L{line_no}"


def classify_bucket(status: str, text: str) -> tuple[str, str]:
    if status.lower() == "x":
        return "DONE", "checked [x]"

    low = text.lower()
    if any(
        k in low
        for k in (
            "phase 20",
            "source_revision",
            "revision_qualified",
            "graphify",
            "bitfrost",
            "centroid:",
            "cuvs",
            "rapids",
            "cutile",
            "qlora",
            "triton",
            "tensorrt",
            "dawn",
            "libtorch",
            "cuda",
            "nvcc",
        )
    ):
        return "PHASE20_OR_GPU_BLOCKED", "requires Phase 20 lift or GPU/CUDA/cuVS lease"

    if any(
        k in low
        for k in (
            "migration",
            "drizzle-kit",
            "postgres",
            "live db schema",
            "drizzle schema",
            "5434",
            "seaweedfs",
            "8333",
            "docker",
            "restart",
            "operator",
            "storage_state",
            "staging",
            "8122",
            "8095",
        )
    ):
        return "APPROVAL_OR_DB_GATED", "requires DB migration, staging env, or operator service action"

    if status == "~" or any(
        k in low
        for k in (
            "blocked on",
            "only after",
            "playwright",
            "e2e",
            "proof",
            "parity",
            "benchmark",
            "readback",
            "verify",
            "acceptance",
        )
    ):
        return "PROOF_PENDING", "partial [~] or awaits parity/Playwright/readback proof"

    return "CODE_ONLY_TESTABLE", "local code + unit/Vitest/pytest scope"


def score_code_only(text: str) -> float:
    low = text.lower()
    score = 50.0
    if re.search(r"\b[a-z0-9_-]+\.(ts|svelte|py|spec\.ts|test\.ts)\b", text):
        score += 20.0
    if any(k in low for k in ("vitest", "pytest", "unit", "zod", "schema", "typescript")):
        score += 15.0
    if len(text) < 220:
        score += 10.0
    elif len(text) > 450:
        score -= 10.0
    return max(0.0, min(100.0, score))


def main() -> None:
    bucket_counts: Counter[str] = Counter()
    per_change_counts: dict[str, Counter[str]] = {}
    code_only_candidates: list[dict] = []
    total_rows = 0

    for tasks_file in sorted(CHANGES_DIR.glob("*/tasks.md")):
        change = tasks_file.parent.name
        if change == "archive":
            continue
        lines = tasks_file.read_text(encoding="utf-8", errors="replace").splitlines()
        seen_ids: Counter[str] = Counter()
        c_counts: Counter[str] = Counter()

        for idx, line in enumerate(lines, start=1):
            m = TASK_LINE_RE.match(line)
            if not m:
                continue
            total_rows += 1
            status = m.group(1)
            text = m.group(2).strip()
            bare_id = extract_bare_id(text, idx)
            seen_ids[bare_id] += 1
            ordinal = seen_ids[bare_id]
            durable_key = f"{change}:{bare_id}:{ordinal}"
            bucket, reason = classify_bucket(status, text)

            bucket_counts[bucket] += 1
            c_counts[bucket] += 1

            if bucket == "CODE_ONLY_TESTABLE":
                summary = text.replace("**", "").replace("|", "/").strip()
                if len(summary) > 140:
                    summary = summary[:137] + "..."
                code_only_candidates.append(
                    {
                        "candidateOrdinal": len(code_only_candidates),
                        "canonicalId": durable_key,
                        "change": change,
                        "bareId": bare_id,
                        "ordinal": ordinal,
                        "locator": f"openspec/changes/{change}/tasks.md#L{idx}",
                        "score": score_code_only(text),
                        "reason": reason,
                        "summary": summary,
                    }
                )

        per_change_counts[change] = c_counts

    topk_batch = stable_topk(code_only_candidates, k=50, offset=0)
    by_ord = {c["candidateOrdinal"]: c for c in code_only_candidates}
    top50_batch = [by_ord[r["candidateOrdinal"]] for r in topk_batch["candidates"]]

    payload = {
        "schema": "atlas.openspec-task-triage.v1",
        "writesPerformed": False,
        "canonicalAuthority": False,
        "durableKeyFormat": "<change>:<bareId>:<ordinal> (#Lnn locator only)",
        "changeCount": len(per_change_counts),
        "totalTasks": total_rows,
        "bucketCounts": dict(bucket_counts),
        "topkSchema": topk_batch["schema"],
        "top50CodeOnlyBatch": top50_batch,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    md = [
        "# OpenSpec 14.8k Task Triage Report (v1)",
        "",
        f"- **Changes Scanned**: {len(per_change_counts)}",
        f"- **Total Task Rows**: {total_rows}",
        f"- **Durable Key**: `<change>:<bareId>:<ordinal>` (`#Lnn` locator only)",
        f"- **Authority**: Non-canonical read-only triage (`writesPerformed: false`)",
        "",
        "## Bucket Counts",
        "",
        "| Bucket | Count | Meaning |",
        "| :--- | ---: | :--- |",
        f"| `DONE` | {bucket_counts['DONE']} | Already checked `[x]` |",
        f"| `CODE_ONLY_TESTABLE` | {bucket_counts['CODE_ONLY_TESTABLE']} | Safe local code + unit/Vitest/pytest scope |",
        f"| `PROOF_PENDING` | {bucket_counts['PROOF_PENDING']} | Partial `[~]` or awaits parity/Playwright/readback proof |",
        f"| `APPROVAL_OR_DB_GATED` | {bucket_counts['APPROVAL_OR_DB_GATED']} | Requires DB migration, staging env, or operator action |",
        f"| `PHASE20_OR_GPU_BLOCKED` | {bucket_counts['PHASE20_OR_GPU_BLOCKED']} | Blocked by Phase 20 deferral or GPU/CUDA/cuVS lease |",
        "",
        "## Top 20 `CODE_ONLY_TESTABLE` Batch Candidates (`atlas.topk.v1`)",
        "",
        "| Rank | Score | Durable Key | Locator | Summary |",
        "| :---: | :---: | :--- | :--- | :--- |",
    ]
    for rank, item in enumerate(top50_batch[:20], start=1):
        md.append(
            f"| {rank} | {item['score']:.0f} | `{item['canonicalId']}` | `{item['locator']}` | {item['summary']} |"
        )

    OUT_MD.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "changes": len(per_change_counts),
                "totalTasks": total_rows,
                "bucketCounts": dict(bucket_counts),
                "top50BatchCount": len(top50_batch),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
