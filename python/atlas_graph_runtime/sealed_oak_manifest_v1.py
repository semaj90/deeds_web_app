"""Sealed ContextManifest + allowlisted OaK kernel handoff builder (OaK 2026 Gate #1 & #3).

Serializes a deterministic, SHA-256-checksummed `ContextManifest` binding:
- Canonical `sourceRefs` and exact `sourceRevision` / `workspaceRevision` / `graphSnapshotRevision`
- Strictly allowlisted read-only OaK operations (`lookup`, `search`, `ancestors`, `descendants`)
- Bounded execution budgets (`maxIters`, `maxLlmCalls`, `maxOutputBytes`, `timeoutMs`)
- Optional `pgvector` prefill hits (`chunkId`, `relativePath`, `cosineSimilarity`)

Fail-closed (`AGENTS.md`):
- Missing/empty revisions, empty `sourceRefs`, or non-allowlisted OaK ops raise `ValueError`.
- Never persists hidden states (`hiddenStatePersisted: False`, `canonicalAuthority: False`).
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

OAK_ALLOWLISTED_READONLY_OPS = ("lookup", "search", "ancestors", "descendants")


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def build_sealed_oak_manifest_v1(
    *,
    task_id: str,
    source_refs: list[str],
    source_revision: str,
    workspace_revision: str,
    graph_snapshot_revision: str,
    allowed_oak_ops: list[str] | tuple[str, ...] = OAK_ALLOWLISTED_READONLY_OPS,
    prefill_hits: list[dict[str, Any]] | None = None,
    max_iters: int = 3,
    max_llm_calls: int = 4,
    max_output_bytes: int = 32_768,
    timeout_ms: int = 15_000,
) -> dict[str, Any]:
    """Build and SHA-256-seal a read-only ContextManifest for OaK / DSPy bounded execution."""
    if not task_id or not task_id.strip():
        raise ValueError("MANIFEST_TASK_ID_MISSING")
    if not source_refs or any(not str(r).strip() for r in source_refs):
        raise ValueError("MANIFEST_SOURCE_REFS_EMPTY")
    for name, val in (
        ("source_revision", source_revision),
        ("workspace_revision", workspace_revision),
        ("graph_snapshot_revision", graph_snapshot_revision),
    ):
        if not val or not str(val).strip():
            raise ValueError(f"MANIFEST_REVISION_MISSING:{name}")

    ops = tuple(dict.fromkeys(str(op).strip() for op in allowed_oak_ops))
    if not ops or any(op not in OAK_ALLOWLISTED_READONLY_OPS for op in ops):
        raise ValueError(f"MANIFEST_OAK_OP_NOT_ALLOWLISTED:{ops}")

    if max_iters < 1 or max_llm_calls < 1 or max_output_bytes < 512 or timeout_ms < 500:
        raise ValueError("MANIFEST_BUDGET_INVALID")

    bounded_hits = [
        {
            "chunkId": str(h["chunkId"]),
            "relativePath": str(h.get("relativePath", "")),
            "cosineSimilarity": float(h.get("cosineSimilarity", 0.0)),
        }
        for h in (prefill_hits or [])[:20]
    ]

    body = {
        "schema": "atlas.sealed-oak-context-manifest.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "taskId": task_id.strip(),
        "revisions": {
            "sourceRevision": source_revision.strip(),
            "workspaceRevision": workspace_revision.strip(),
            "graphSnapshotRevision": graph_snapshot_revision.strip(),
        },
        "sourceRefs": sorted({str(r).strip() for r in source_refs}),
        "allowedOakOps": list(ops),
        "budgets": {
            "maxIters": int(max_iters),
            "maxLlmCalls": int(max_llm_calls),
            "maxOutputBytes": int(max_output_bytes),
            "timeoutMs": int(timeout_ms),
        },
        "prefillHits": bounded_hits,
    }
    checksum = "sha256:" + hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()
    return {**body, "manifestChecksum": checksum}


def verify_sealed_oak_manifest_v1(manifest: dict[str, Any]) -> bool:
    """Verify a sealed ContextManifest checksum and allowlisted OaK ops."""
    expected = manifest.get("manifestChecksum")
    if not isinstance(expected, str) or not expected.startswith("sha256:"):
        return False
    body = {k: v for k, v in manifest.items() if k != "manifestChecksum"}
    actual = "sha256:" + hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()
    if actual != expected:
        return False
    ops = manifest.get("allowedOakOps") or []
    return bool(ops) and all(op in OAK_ALLOWLISTED_READONLY_OPS for op in ops)
