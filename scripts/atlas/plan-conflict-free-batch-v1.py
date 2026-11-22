#!/usr/bin/env python3
"""
Conflict-Free 2-Worker A2A/MCP Batch Planner (v1)

Reads `docs/reports/openspec-task-triage-v1.json` (`top50CodeOnlyBatch`),
extracts referenced file-ownership tokens (`*.ts`, `*.svelte`, `*.py`),
and partitions eligible tasks into two disjoint `patch_targets` worker lanes
without modifying any source files or canonical stores.

Output: docs/reports/openspec-conflict-free-batch-v1.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TRIAGE_JSON = REPO_ROOT / "docs" / "reports" / "openspec-task-triage-v1.json"
OUT_JSON = REPO_ROOT / "docs" / "reports" / "openspec-conflict-free-batch-v1.json"

FILE_RE = re.compile(r"\b([a-zA-Z0-9_./-]+\.(?:ts|mts|js|mjs|svelte|py))\b")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=int, default=0, help="Skip first N eligible tasks in top50CodeOnlyBatch (wave selector)")
    parser.add_argument("--out", type=Path, default=OUT_JSON, help="Output JSON path")
    args = parser.parse_args()

    triage = json.loads(TRIAGE_JSON.read_text(encoding="utf-8"))
    batch = triage.get("top50CodeOnlyBatch", [])[args.offset:]

    worker_a: list[dict] = []
    worker_b: list[dict] = []
    files_a: set[str] = set()
    files_b: set[str] = set()
    skipped_conflicts: list[dict] = []

    for item in batch:
        summary = item.get("summary", "")
        owned_files = set(FILE_RE.findall(summary))
        if not owned_files:
            owned_files = {f"scope:{item.get('change')}:{item.get('bareId')}"}

        entry = {
            "durableKey": item["canonicalId"],
            "locator": item["locator"],
            "score": item["score"],
            "ownedFiles": sorted(owned_files),
            "summary": summary,
        }

        if len(worker_a) <= len(worker_b) and not (owned_files & files_b):
            worker_a.append(entry)
            files_a |= owned_files
        elif not (owned_files & files_a):
            worker_b.append(entry)
            files_b |= owned_files
        else:
            skipped_conflicts.append({
                "durableKey": item["canonicalId"],
                "conflictFiles": sorted(owned_files & (files_a | files_b)),
            })

        if len(worker_a) >= 4 and len(worker_b) >= 4:
            break

    payload = {
        "schema": "atlas.openspec-conflict-free-batch.v1",
        "writesPerformed": False,
        "canonicalAuthority": False,
        "maxConcurrentWorkers": 2,
        "workerA": {"role": "a2a-worker-a", "ownedFiles": sorted(files_a), "tasks": worker_a},
        "workerB": {"role": "a2a-worker-b", "ownedFiles": sorted(files_b), "tasks": worker_b},
        "disjointVerified": len(files_a & files_b) == 0,
        "skippedConflicts": skipped_conflicts,
    }
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({
        "workerACount": len(worker_a),
        "workerBCount": len(worker_b),
        "disjointVerified": payload["disjointVerified"],
        "skippedConflicts": len(skipped_conflicts),
    }, indent=2))


if __name__ == "__main__":
    main()
