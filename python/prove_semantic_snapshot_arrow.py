#!/usr/bin/env python3
"""Build and verify the strict Arrow/mmap SemanticSnapshotV1 artifact.

This command is intentionally input-only: it never queries or mutates Postgres,
Qdrant, Valkey, Neo4j, or TurboVec. The NDJSON input must already contain real
per-row source/canonical revisions. Duplicate non-null source_ref values fail
closed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from atlas_compute.semantic_snapshot_freeze import freeze_semantic_snapshot, load_and_verify_frozen_snapshot


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Revision-qualified semantic_768 NDJSON")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--workspace-revision", required=True)
    parser.add_argument("--snapshot-revision", required=True)
    parser.add_argument("--representation-revision", required=True)
    parser.add_argument("--producer-revision", required=True)
    parser.add_argument("--ordinal-map-revision")
    args = parser.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    tensor = out / "semantic_768.npy"
    arrow = out / "semantic_768.arrow"
    manifest = out / "semantic-snapshot-v1.json"

    receipt = freeze_semantic_snapshot(
        args.input,
        tensor_path=tensor,
        manifest_path=manifest,
        snapshot_revision=args.snapshot_revision,
        representation_revision=args.representation_revision,
        producer_revision=args.producer_revision,
        workspace_revision=args.workspace_revision,
        ordinal_map_revision=args.ordinal_map_revision,
        arrow_ipc_path=arrow,
        require_unique_source_refs=True,
    )
    matrix, verified = load_and_verify_frozen_snapshot(manifest)
    report = {
        "schema": "atlas.semantic-snapshot-arrow-proof.v1",
        "status": "SEMANTIC_SNAPSHOT_V1_PROVEN",
        "rowCount": int(matrix.shape[0]),
        "dimension": int(matrix.shape[1]),
        "dtype": str(matrix.dtype),
        "workspaceRevision": receipt.workspace_revision,
        "representationRevision": receipt.representation_revision,
        "sourceRevisionChecksum": receipt.source_revision_checksum,
        "ordinalMapRevision": receipt.ordinal_map_revision,
        "rowIdentityChecksum": receipt.row_identity_checksum,
        "canonicalOrderChecksum": receipt.canonical_order_checksum,
        "tensorChecksum": receipt.tensor_checksum,
        "arrowIpcChecksum": receipt.arrow_ipc_checksum,
        "arrowIpcBytes": receipt.arrow_ipc_bytes,
        "mmapVerified": receipt.mmap_verified,
        "sourceRefUnique": receipt.source_ref_unique,
        "manifestPath": str(manifest),
        "arrowPath": str(arrow),
        "verifiedSchema": verified["schema"],
    }
    proof_path = out / "semantic-snapshot-arrow-proof.json"
    proof_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
