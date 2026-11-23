#!/usr/bin/env python3
"""Join local OpenSpec task inventory rows to a fresh canonical workboard snapshot.

This is a read-only projection. It attaches workboard identities only when the
inventory's complete task-file SHA-256 matches the snapshot and the exact
source path + line resolves to one task. It never joins by title, generated
locator alone, or a declared task code alone.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


SNAPSHOT_SCHEMA = "atlas.openspec.workboard-task-snapshot.v1"
OUTPUT_SCHEMA = "atlas.openspec.task-inventory-workboard-join.v1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", errors="strict") as stream:
        for line_number, raw in enumerate(stream, 1):
            if not raw.strip():
                continue
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError(f"inventory row {line_number} must be a JSON object")
            rows.append(value)
    return rows


def reconcile_rows(inventory_rows: list[dict[str, Any]], snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    if snapshot.get("schema") != SNAPSHOT_SCHEMA:
        raise ValueError(f"unsupported workboard snapshot schema: {snapshot.get('schema')!r}")
    source_hashes = snapshot.get("sourceFileHashes")
    tasks = snapshot.get("tasks")
    if not isinstance(source_hashes, dict) or not isinstance(tasks, list):
        raise ValueError("workboard snapshot requires sourceFileHashes and tasks")

    normalized_hashes = {
        str(source).replace("\\", "/"): revision
        for source, revision in source_hashes.items()
        if isinstance(revision, str)
    }
    tasks_by_location: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for task in tasks:
        if not isinstance(task, dict) or not isinstance(task.get("source"), str):
            continue
        line = task.get("line")
        if isinstance(line, int) and not isinstance(line, bool):
            source = task["source"].replace("\\", "/")
            tasks_by_location[(source, line)].append(task)

    joined: list[dict[str, Any]] = []
    for row in inventory_rows:
        source = str(row.get("file") or "").replace("\\", "/")
        line = row.get("line")
        inventory_revision = row.get("sourceFileRevision")
        snapshot_revision = normalized_hashes.get(source)
        status = ""
        match: dict[str, Any] | None = None
        candidates: list[dict[str, Any]] = []

        if not source or not isinstance(line, int) or isinstance(line, bool):
            status = "INVALID_INVENTORY_LOCATOR"
        elif snapshot_revision is None:
            status = "OUTSIDE_WORKBOARD_SNAPSHOT_SCOPE"
        elif inventory_revision != snapshot_revision:
            status = "STALE_SOURCE_REVISION"
        else:
            candidates = tasks_by_location.get((source, line), [])
            if not candidates:
                status = "NO_WORKBOARD_TASK_AT_SOURCE_LINE"
            elif len(candidates) != 1:
                status = "AMBIGUOUS_WORKBOARD_LOCATION"
            else:
                candidate = candidates[0]
                identity = candidate.get("taskIdentity") or {}
                task_revision = identity.get("taskRevision")
                block_hash = candidate.get("blockHash")
                if not task_revision or task_revision != block_hash:
                    status = "WORKBOARD_TASK_REVISION_INCONSISTENT"
                else:
                    match = candidate
                    status = "MATCHED_EXACT_SOURCE_REVISION"

        identity = (match or {}).get("taskIdentity") or {}
        program = (match or {}).get("program") or {}
        program_classification = program.get("classification")
        if not match:
            program_label_disposition = "NO_EXACT_TASK_JOIN"
        elif program_classification == "TASK_TEXT_RULE":
            program_label_disposition = "HEURISTIC_CANDIDATE_ONLY"
        elif program_classification == "CHANGE_FALLBACK_REVIEW":
            program_label_disposition = "CHANGE_FALLBACK_REVIEW_ONLY"
        elif program_classification == "UNCLASSIFIED_REVIEW_REQUIRED":
            program_label_disposition = "NO_CANDIDATE_REVIEW_REQUIRED"
        else:
            program_label_disposition = "UNRECOGNIZED_PROGRAM_CLASSIFICATION"
        joined.append({
            "schema": OUTPUT_SCHEMA,
            "inventoryLocator": row.get("id"),
            "source": source or None,
            "line": line if isinstance(line, int) and not isinstance(line, bool) else None,
            "taskCode": row.get("task_code"),
            "inventoryStatus": row.get("status"),
            "sourceFileRevision": inventory_revision,
            "taskLineChecksum": row.get("taskLineChecksum"),
            "joinStatus": status,
            "workboardTaskKey": (match or {}).get("taskKey"),
            "stableKey": (match or {}).get("stableKey"),
            "logicalTaskKey": (match or {}).get("logicalTaskKey"),
            "taskRevision": identity.get("taskRevision") if match else None,
            "identityBasis": identity.get("basis") if match else None,
            "workboardState": (match or {}).get("state"),
            "workboardLane": (match or {}).get("lane"),
            "workboardProgramClassification": program_classification,
            "workboardProgramMatchedRule": program.get("matchedRule"),
            "programLabelDisposition": program_label_disposition,
            "reviewedTaskDomainLabel": None,
        })
    return joined


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, required=True, help="local extractor .all.jsonl")
    parser.add_argument("--snapshot", type=Path, required=True, help="fresh workboard task snapshot JSON")
    parser.add_argument("--output", type=Path, required=True, help="joined JSONL output")
    parser.add_argument("--manifest", type=Path, required=True, help="summary/provenance JSON output")
    args = parser.parse_args()

    inventory_rows = load_jsonl(args.inventory)
    snapshot_bytes = args.snapshot.read_bytes()
    snapshot = json.loads(snapshot_bytes.decode("utf-8-sig", errors="strict"))
    joined = reconcile_rows(inventory_rows, snapshot)
    counts = Counter(row["joinStatus"] for row in joined)
    output_bytes = "".join(json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n" for row in joined).encode("utf-8")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(output_bytes)
    manifest = {
        "schema": "atlas.openspec.task-inventory-workboard-join-manifest.v1",
        "readOnlyProjection": True,
        "writesPerformed": False,
        "joinPolicy": "EXACT_SOURCE_PATH_LINE_AND_SOURCE_FILE_SHA256; NO_TITLE_OR_CODE_FALLBACK",
        "inputs": {
            "inventory": str(args.inventory),
            "inventorySha256": sha256_file(args.inventory),
            "snapshot": str(args.snapshot),
            "snapshotSha256": "sha256:" + hashlib.sha256(snapshot_bytes).hexdigest(),
            "snapshotSchema": snapshot.get("schema"),
            "snapshotGeneratedAt": snapshot.get("generatedAt"),
            "snapshotTaskCount": len(snapshot.get("tasks", [])),
        },
        "output": {
            "path": str(args.output),
            "sha256": "sha256:" + hashlib.sha256(output_bytes).hexdigest(),
        },
        "rowCount": len(joined),
        "joinStatusCounts": dict(sorted(counts.items())),
        "programClassificationCountsOnExactMatches": dict(sorted(Counter(
            row["workboardProgramClassification"] or "MISSING"
            for row in joined if row["joinStatus"] == "MATCHED_EXACT_SOURCE_REVISION"
        ).items())),
        "programLabelDispositionCounts": dict(sorted(Counter(row["programLabelDisposition"] for row in joined).items())),
        "reviewedTaskDomainLabelCount": sum(1 for row in joined if row["reviewedTaskDomainLabel"] is not None),
        "exactMatchesWithLogicalTaskKey": sum(
            1 for row in joined
            if row["joinStatus"] == "MATCHED_EXACT_SOURCE_REVISION" and row["logicalTaskKey"]
        ),
        "exactMatchesWithoutLogicalTaskKey": sum(
            1 for row in joined
            if row["joinStatus"] == "MATCHED_EXACT_SOURCE_REVISION" and not row["logicalTaskKey"]
        ),
        "declaredTaskCodeRows": sum(1 for row in joined if row["taskCode"]),
        "declaredTaskCodeExactMatches": sum(
            1 for row in joined
            if row["taskCode"] and row["joinStatus"] == "MATCHED_EXACT_SOURCE_REVISION"
        ),
    }
    args.manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(args.manifest), "rows": len(joined), "joinStatusCounts": manifest["joinStatusCounts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
