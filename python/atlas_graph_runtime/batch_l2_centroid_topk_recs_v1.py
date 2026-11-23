"""Batch document analysis -> Top-K agentic error-fixing recommendations -> L2 Valkey centroid/LangGraph descriptor.

Strictly enforces L2 Valkey/Redis external cache residency (`cacheTier: "L2_VALKEY_CENTROID_LANGGRAPH"`)
and rejects L1 in-process caching (`L1_IN_PROCESS_CACHE_PROHIBITED`) to preserve host RAM.

Per `AGENTS.md`:
- Caches ONLY compact revision- and checksum-addressed descriptors (`candidateIds`,
  `centroidManifestRevision`, `sourceRevisions`, `ttlSeconds`, `invalidationKey`).
- Never caches raw source bodies, embeddings/vectors, tensors, hidden state, or GPU pointers.
- Pre-filters stale/superseded documents before ranking verified claims via PUCT.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from atlas_graph_runtime.batch_staleness_superseded_check_v1 import (
    classify_document_staleness_v1,
)
from atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import (
    score_agentic_repair_puct_v1,
)

ALLOWED_L2_CACHE_TIER = "L2_VALKEY_CENTROID_LANGGRAPH"
MAX_TOP_K = 20
FORBIDDEN_L2_KEYS = frozenset(
    {
        "content",
        "sourcebody",
        "source_body",
        "embedding",
        "embeddings",
        "vector",
        "vectors",
        "tensor",
        "kv_cache",
        "hiddenthoughts",
        "chainofthought",
        "device_ptr",
    }
)


def _assert_compact_l2_descriptor_only(obj: Any) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).strip().lower() in FORBIDDEN_L2_KEYS:
                raise ValueError(f"FORBIDDEN_L2_DESCRIPTOR_KEY:{k}")
            _assert_compact_l2_descriptor_only(v)
    elif isinstance(obj, list):
        for item in obj:
            _assert_compact_l2_descriptor_only(item)


def build_l2_valkey_centroid_langgraph_descriptor_v1(
    *,
    task_id: str,
    centroid_manifest_revision: str,
    workspace_revision: str,
    documents: list[dict[str, Any]],
    cache_tier: str = ALLOWED_L2_CACHE_TIER,
    top_k: int = 10,
    ttl_seconds: int = 900,
    max_age_hours: float | None = None,
) -> dict[str, Any]:
    """Filter batch docs for staleness, rank verified repair candidates, and emit an L2 Valkey descriptor."""
    if cache_tier != ALLOWED_L2_CACHE_TIER:
        raise ValueError(f"L1_IN_PROCESS_CACHE_PROHIBITED:got={cache_tier},expected={ALLOWED_L2_CACHE_TIER}")
    if not task_id.strip() or not centroid_manifest_revision.strip() or not workspace_revision.strip():
        raise ValueError("L2_DESCRIPTOR_REVISION_MISSING")
    if top_k < 1 or top_k > MAX_TOP_K:
        raise ValueError(f"L2_TOP_K_OUT_OF_RANGE:{top_k}")
    if ttl_seconds < 60 or ttl_seconds > 86_400:
        raise ValueError(f"L2_TTL_OUT_OF_RANGE:{ttl_seconds}")

    _assert_compact_l2_descriptor_only(documents)

    now_utc = datetime.now(timezone.utc)
    eligible_candidates: list[dict[str, Any]] = []
    skipped_docs: list[dict[str, str]] = []

    for doc in documents:
        verdict = classify_document_staleness_v1(
            indexed_at=doc.get("indexedAt"),
            source_modified_at=doc.get("sourceModifiedAt"),
            superseded_by=doc.get("supersededBy"),
            stored_hash=doc.get("storedHash"),
            current_hash=doc.get("currentHash"),
            max_age_hours=max_age_hours,
            now_utc=now_utc,
        )
        if not verdict["eligibleForBatch"]:
            skipped_docs.append({"candidateId": str(doc.get("candidateId", "")), "status": verdict["status"]})
            continue
        eligible_candidates.append(doc)

    ranked = score_agentic_repair_puct_v1(eligible_candidates)[:top_k]
    top_ids = [r["candidateId"] for r in ranked]
    valkey_key = f"langgraph:cache:l2:centroid:{task_id.strip()}:{centroid_manifest_revision.strip()}"
    invalidation_key = f"atlas:inv:ws:{workspace_revision.strip()}:centroid:{centroid_manifest_revision.strip()}"

    body = {
        "schema": "atlas.l2-valkey-centroid-langgraph-topk.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "cacheTier": ALLOWED_L2_CACHE_TIER,
        "l1RamBytesRetained": 0,
        "taskId": task_id.strip(),
        "workspaceRevision": workspace_revision.strip(),
        "centroidManifestRevision": centroid_manifest_revision.strip(),
        "valkeyKey": valkey_key,
        "invalidationKey": invalidation_key,
        "ttlSeconds": int(ttl_seconds),
        "inputDocCount": len(documents),
        "skippedStaleOrSupersededCount": len(skipped_docs),
        "skippedDocs": skipped_docs,
        "topKCandidateIds": top_ids,
        "recommendations": ranked,
    }
    checksum = "sha256:" + hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    return {**body, "descriptorChecksum": checksum}
