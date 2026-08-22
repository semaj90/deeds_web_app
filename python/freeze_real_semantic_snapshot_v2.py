#!/usr/bin/env python3
"""Freeze a revision-qualified Atlas semantic_768 source export as v2.

The source NDJSON is produced by:
  sveltekit-frontend/scripts/atlas/export-frozen-semantic-v2-source.mts

This script performs no database or Qdrant writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.real_semantic_snapshot import derive_real_semantic_snapshot_revision
from atlas_compute.semantic_snapshot_freeze import freeze_semantic_snapshot, load_and_verify_frozen_snapshot


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-receipt", required=True)
    parser.add_argument("--tensor", default=".tmp/aligned-snapshot/semantic-768-v2.npy")
    parser.add_argument("--manifest", default=".tmp/aligned-snapshot/semantic-768-v2-manifest.json")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    source_receipt_path = Path(args.source_receipt).resolve()
    tensor = Path(args.tensor).resolve()
    manifest = Path(args.manifest).resolve()
    receipt = json.loads(source_receipt_path.read_text(encoding="utf-8"))

    if receipt.get("schema") != "atlas.frozen-semantic-v2-source-export.v1":
        raise ValueError("unsupported semantic source export receipt")
    if receipt.get("status") != "REVISION_QUALIFIED_SOURCE_EXPORTED":
        raise ValueError("semantic source export is not revision-qualified")
    if receipt.get("representationId") != "semantic_768":
        raise ValueError("semantic source export is not semantic_768")
    if receipt.get("atlasPacketWorkspaceCacheEpochUsedAsAuthority") is not False:
        raise ValueError("legacy packet workspace cache epoch cannot be snapshot authority")
    if receipt.get("gitRevisionUsedAsAuthority") is not False:
        raise ValueError("Git revision cannot be snapshot workspace authority")

    observed_source_sha = sha256_file(source)
    if observed_source_sha != receipt.get("ndjsonSha256"):
        raise ValueError("semantic source NDJSON checksum mismatch")

    snapshot_revision = derive_real_semantic_snapshot_revision(
        workspace_revision=str(receipt["workspaceRevision"]),
        representation_revision=str(receipt["representationRevision"]),
        source_ndjson_sha256=observed_source_sha,
        source_revision_checksum=str(receipt["sourceRevisionChecksum"]),
    )
    frozen = freeze_semantic_snapshot(
        source,
        tensor_path=tensor,
        manifest_path=manifest,
        snapshot_revision=snapshot_revision,
        representation_revision=str(receipt["representationRevision"]),
        producer_revision="atlas.freeze-real-semantic-snapshot-v2.2026-08-22",
    )
    verified_tensor, verified_manifest = load_and_verify_frozen_snapshot(manifest)
    if frozen.row_count != int(receipt["acceptedRows"]):
        raise RuntimeError("FROZEN_ROW_COUNT_SOURCE_EXPORT_MISMATCH")
    if verified_tensor.shape != (frozen.row_count, 768):
        raise RuntimeError("FROZEN_SEMANTIC_TENSOR_SHAPE_MISMATCH")
    if verified_manifest["snapshot_revision"] != snapshot_revision:
        raise RuntimeError("FROZEN_SEMANTIC_SNAPSHOT_REVISION_MISMATCH")

    print(json.dumps({
        "status": "FROZEN_SEMANTIC_SNAPSHOT_V2_VERIFIED",
        "snapshotRevision": snapshot_revision,
        "workspaceRevision": receipt["workspaceRevision"],
        "representationRevision": receipt["representationRevision"],
        "rowCount": frozen.row_count,
        "dimensions": frozen.dimensions,
        "tensorChecksum": frozen.tensor_checksum,
        "rowIdentityChecksum": frozen.row_identity_checksum,
        "canonicalOrderChecksum": frozen.canonical_order_checksum,
        "inputFileChecksum": frozen.input_file_checksum,
        "manifest": str(manifest),
        "tensor": str(tensor),
        "postgresWritesAttempted": False,
        "qdrantWritesAttempted": False,
        "canonicalAuthority": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
