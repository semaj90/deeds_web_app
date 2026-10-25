#!/usr/bin/env python3
"""Create a diagnostic-only readback for unresolved domain-review candidates."""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_domain_candidate_helper_v1 import bind_candidate_record

CANDIDATES_PATH = ROOT / ".tmp" / "atlas" / "domain-review-v3" / "candidates.jsonl"
OUTPUT_ROOT = ROOT / ".tmp" / "atlas" / "domain-review-v3" / "diagnostic-readback-v1"
OUT_JSONL = OUTPUT_ROOT / "candidates.jsonl"
RECEIPT_PATH = OUTPUT_ROOT / "receipt.json"


def build_diagnostic_readback(
    candidates: list[dict[str, Any]], workspace_root: Path
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows = [bind_candidate_record(candidate, workspace_root) for candidate in candidates]
    counts = {
        "total": len(rows),
        "localContentHashObserved": sum(bool(row.get("sourceContentHash")) for row in rows),
        "exactEvidenceSpanFound": sum(bool(row.get("evidenceSpanCheck", {}).get("found")) for row in rows),
        "packetKeyBound": sum(row.get("packetKey") is not None for row in rows),
        "sourceRevisionBound": sum(row.get("sourceRevision") is not None for row in rows),
        "workspaceRevisionBound": sum(row.get("workspaceRevision") is not None for row in rows),
        "canonicalAuthorityGranted": sum(row.get("canonicalAuthority") is True for row in rows),
    }
    receipt = {
        "schema": "atlas.domain-candidate-diagnostic-readback.v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "readOnly": True,
        "writesPerformed": True,
        "writeScope": "scratch_diagnostic_artifacts_only",
        "persistentStoreWritesPerformed": False,
        "datastoreWritesPerformed": False,
        "cacheWritesPerformed": False,
        "canonicalAuthority": False,
        "status": "DIAGNOSTIC_ONLY_UNRESOLVED",
        "sourceInput": str(CANDIDATES_PATH.relative_to(ROOT)),
        "sourceInputChecksum": "sha256:" + hashlib.sha256(CANDIDATES_PATH.read_bytes()).hexdigest()
        if CANDIDATES_PATH.is_file()
        else None,
        "counts": counts,
    }
    return rows, receipt


def main() -> None:
    if not CANDIDATES_PATH.is_file():
        print(f"ERROR: {CANDIDATES_PATH} not found", file=sys.stderr)
        raise SystemExit(1)

    candidates = [
        json.loads(line)
        for line in CANDIDATES_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    rows, receipt = build_diagnostic_readback(candidates, ROOT)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows).encode("utf-8")
    OUT_JSONL.write_bytes(output)
    receipt["outputFile"] = str(OUT_JSONL.relative_to(ROOT))
    receipt["outputChecksum"] = "sha256:" + hashlib.sha256(output).hexdigest()
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
