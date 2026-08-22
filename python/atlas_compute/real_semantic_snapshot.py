"""Deterministic lineage helpers for real FrozenSemanticSnapshotV2 inputs."""
from __future__ import annotations

import hashlib
import json
from typing import Any


def _checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def derive_real_semantic_snapshot_revision(
    *,
    workspace_revision: str,
    representation_revision: str,
    source_ndjson_sha256: str,
    source_revision_checksum: str,
) -> str:
    if not workspace_revision.startswith("sha256:") or len(workspace_revision) != 71:
        raise ValueError("workspace_revision must be sha256:<64hex>")
    for name, value in {
        "source_ndjson_sha256": source_ndjson_sha256,
        "source_revision_checksum": source_revision_checksum,
    }.items():
        if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
            raise ValueError(f"{name} must be 64 lowercase hex characters")
    if not representation_revision:
        raise ValueError("representation_revision required")
    return "sha256:" + _checksum({
        "schema": "atlas.real-semantic-snapshot-revision.v1",
        "workspace_revision": workspace_revision,
        "representation_revision": representation_revision,
        "source_ndjson_sha256": source_ndjson_sha256,
        "source_revision_checksum": source_revision_checksum,
    })
