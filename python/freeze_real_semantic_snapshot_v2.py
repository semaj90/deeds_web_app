#!/usr/bin/env python3
"""Freeze a real revision-qualified Parent Atlas semantic_768 v2 snapshot.

Input is the read-only Postgres export receipt produced by
export-frozen-semantic-snapshot-v2-input.mts. This runner refuses incomplete
workspace manifests and independently rechecks tensor, versioned-row identity,
and canonical-order checksums after freezing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.semantic_snapshot_freeze import (
    freeze_semantic_snapshot,
    load_and_verify_frozen_snapshot,
)

SHA256_REVISION = re.compile(r"^sha256:[a-f0-9]{64}$")
PRODUCER_REVISION = "atlas.freeze-real-semantic-snapshot-v2.2026-08-21.v1"


def stable_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def verify_v2_identity(manifest: dict[str, Any]) -> dict[str, Any]:
    if manifest.get("schema") != "atlas.frozen-semantic-snapshot.v2":
        raise RuntimeError("FROZEN_SEMANTIC_V2_SCHEMA_REQUIRED")
    rows_raw = manifest.get("rows")
    if not isinstance(rows_raw, list) or len(rows_raw) != int(manifest.get("row_count") or -1):
        raise RuntimeError("FROZEN_SEMANTIC_V2_ROWS_INVALID")

    normalized_rows: list[dict[str, Any]] = []
    canonical_ids: list[str] = []
    seen: set[str] = set()
    for ordinal, raw in enumerate(rows_raw):
        if not isinstance(raw, dict):
            raise RuntimeError(f"FROZEN_SEMANTIC_V2_ROW_NOT_OBJECT:{ordinal}")
        canonical_id = str(raw.get("canonical_id") or "")
        canonical_revision = str(raw.get("canonical_revision") or "")
        source_ref_raw = raw.get("source_ref")
        source_ref = str(source_ref_raw) if source_ref_raw is not None else None
        if int(raw.get("ordinal", -1)) != ordinal:
            raise RuntimeError(f"FROZEN_SEMANTIC_V2_ORDINAL_NOT_DENSE:{ordinal}")
        if not canonical_id or canonical_id in seen:
            raise RuntimeError(f"FROZEN_SEMANTIC_V2_CANONICAL_ID_INVALID:{ordinal}")
        if not SHA256_REVISION.fullmatch(canonical_revision):
            raise RuntimeError(f"FROZEN_SEMANTIC_V2_CANONICAL_REVISION_INVALID:{canonical_id}")
        if source_ref is None or not source_ref:
            raise RuntimeError(f"FROZEN_SEMANTIC_V2_SOURCE_REF_REQUIRED:{canonical_id}")
        seen.add(canonical_id)
        canonical_ids.append(canonical_id)
        normalized_rows.append({
            "ordinal": ordinal,
            "canonical_id": canonical_id,
            "canonical_revision": canonical_revision,
            "source_ref": source_ref,
        })

    row_identity_checksum = sha256_bytes(stable_bytes(normalized_rows))
    canonical_order_checksum = sha256_bytes(stable_bytes(canonical_ids))
    if row_identity_checksum != manifest.get("row_identity_checksum"):
        raise RuntimeError("FROZEN_SEMANTIC_V2_ROW_IDENTITY_CHECKSUM_MISMATCH")
    if canonical_order_checksum != manifest.get("canonical_order_checksum"):
        raise RuntimeError("FROZEN_SEMANTIC_V2_CANONICAL_ORDER_CHECKSUM_MISMATCH")

    return {
        "rowIdentityChecksumVerified": True,
        "canonicalOrderChecksumVerified": True,
        "rowIdentityChecksum": row_identity_checksum,
        "canonicalOrderChecksum": canonical_order_checksum,
        "denseOrdinalCount": len(normalized_rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-receipt", required=True)
    parser.add_argument("--tensor", default=".tmp/aligned-snapshot/semantic-768-v2.npy")
    parser.add_argument("--manifest", default=".tmp/aligned-snapshot/semantic-768-v2-manifest.json")
    parser.add_argument("--proof", default="docs/reports/frozen-semantic-snapshot-v2-proof.json")
    args = parser.parse_args()

    export_receipt_path = Path(args.export_receipt).resolve()
    export_receipt = json.loads(export_receipt_path.read_text(encoding="utf-8"))
    if export_receipt.get("schema") != "atlas.frozen-semantic-snapshot-v2-input-export-receipt.v1":
        raise RuntimeError("FROZEN_SEMANTIC_EXPORT_RECEIPT_SCHEMA_REJECTED")
    if export_receipt.get("status") != "FROZEN_SEMANTIC_SNAPSHOT_V2_INPUT_EXPORTED":
        raise RuntimeError("FROZEN_SEMANTIC_EXPORT_NOT_COMPLETE")
    if export_receipt.get("canonicalWritesAttempted") is not False:
        raise RuntimeError("FROZEN_SEMANTIC_EXPORT_WRITE_SAFETY_REJECTED")
    workspace = export_receipt.get("workspaceManifest") or {}
    if workspace.get("schema") != "atlas.graphify-workspace-manifest-receipt.v1" or workspace.get("complete") is not True:
        raise RuntimeError("GRAPHIFY_WORKSPACE_MANIFEST_NOT_COMPLETE")
    workspace_revision = str(workspace.get("workspaceRevision") or "")
    if not SHA256_REVISION.fullmatch(workspace_revision):
        raise RuntimeError("GRAPHIFY_WORKSPACE_REVISION_INVALID")

    input_path = Path(str(export_receipt.get("inputPath") or "")).resolve()
    if not input_path.is_file():
        raise RuntimeError("FROZEN_SEMANTIC_EXPORT_INPUT_NOT_FOUND")
    observed_input_checksum = sha256_file(input_path)
    if observed_input_checksum != export_receipt.get("inputFileChecksum"):
        raise RuntimeError("FROZEN_SEMANTIC_EXPORT_INPUT_CHECKSUM_MISMATCH")

    representation_revision_number = int(export_receipt.get("representationRevision") or 0)
    if representation_revision_number <= 0:
        raise RuntimeError("FROZEN_SEMANTIC_REPRESENTATION_REVISION_INVALID")
    representation_revision = f"semantic_768:atlas_packets:r{representation_revision_number}"
    snapshot_identity = {
        "workspaceRevision": workspace_revision,
        "sourceManifestDigest": str(workspace.get("sourceManifestDigest") or ""),
        "representationRevision": representation_revision,
        "rowCount": int(export_receipt.get("exportedRowCount") or 0),
        "inputFileChecksum": observed_input_checksum,
    }
    snapshot_revision = f"semantic-snapshot-v2:{sha256_bytes(stable_bytes(snapshot_identity))}"

    tensor_path = Path(args.tensor).resolve()
    manifest_path = Path(args.manifest).resolve()
    proof_path = Path(args.proof).resolve()
    tensor_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    proof_path.parent.mkdir(parents=True, exist_ok=True)

    frozen = freeze_semantic_snapshot(
        input_path,
        tensor_path=tensor_path,
        manifest_path=manifest_path,
        snapshot_revision=snapshot_revision,
        representation_revision=representation_revision,
        producer_revision=PRODUCER_REVISION,
    )
    _tensor, verified_manifest = load_and_verify_frozen_snapshot(manifest_path)
    identity = verify_v2_identity(verified_manifest)

    if frozen.row_count != int(export_receipt.get("exportedRowCount") or -1):
        raise RuntimeError("FROZEN_SEMANTIC_EXPORT_FREEZE_ROW_COUNT_MISMATCH")
    if frozen.snapshot_revision != snapshot_revision or frozen.representation_revision != representation_revision:
        raise RuntimeError("FROZEN_SEMANTIC_REVISION_READBACK_MISMATCH")

    proof_without_checksum = {
        "schema": "atlas.frozen-semantic-snapshot-v2-proof.v1",
        "status": "FROZEN_SEMANTIC_SNAPSHOT_V2_PROVEN",
        "workspaceManifestComplete": True,
        "workspaceRevision": workspace_revision,
        "sourceManifestDigest": workspace.get("sourceManifestDigest"),
        "representation": "semantic_768",
        "representationRevision": representation_revision,
        "representationProvenanceScope": export_receipt.get("representationProvenanceScope"),
        "snapshotRevision": snapshot_revision,
        "rowCount": frozen.row_count,
        "dimensions": frozen.dimensions,
        "tensorChecksum": frozen.tensor_checksum,
        "tensorChecksumVerified": True,
        **identity,
        "inputFileChecksum": observed_input_checksum,
        "manifestFileChecksum": sha256_file(manifest_path),
        "canonicalAuthority": False,
        "databaseWritesAttempted": False,
        "producerRevision": PRODUCER_REVISION,
    }
    proof = {
        **proof_without_checksum,
        "proofChecksum": sha256_bytes(stable_bytes(proof_without_checksum)),
    }
    proof_path.write_text(json.dumps(proof, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": proof["status"],
        "snapshotRevision": snapshot_revision,
        "representationRevision": representation_revision,
        "rowCount": frozen.row_count,
        "tensorChecksum": frozen.tensor_checksum,
        "rowIdentityChecksum": identity["rowIdentityChecksum"],
        "canonicalOrderChecksum": identity["canonicalOrderChecksum"],
        "representationProvenanceScope": proof["representationProvenanceScope"],
        "proof": str(proof_path),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
