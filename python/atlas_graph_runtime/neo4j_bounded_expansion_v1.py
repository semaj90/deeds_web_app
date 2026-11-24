"""Bounded Neo4j 1-to-2-hop graph expansion + ACE ContextManifest v2 validator.

Enforces planner bounds (`max_seeds`, `max_hops <= 2`, `max_visited_nodes`, `LIMIT`)
and revision-consistent ADMITTED-only edge traversal. `proof_usable` is always
computed by the authority validator, never trusted from producer inputs.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping, Sequence


def build_bounded_neo4j_expansion_query_v1(
    *,
    seed_ids: Sequence[str],
    workspace_revision: str,
    max_hops: int = 1,
    max_seeds: int = 20,
    max_visited_nodes: int = 200,
    limit: int = 100,
) -> dict[str, Any]:
    """Build a parameterized, bounded Cypher query for ADMITTED structural edges."""
    if not workspace_revision.strip():
        raise ValueError("WORKSPACE_REVISION_REQUIRED")
    if not seed_ids:
        raise ValueError("SEED_IDS_REQUIRED")
    if max_hops < 1 or max_hops > 2:
        raise ValueError(f"MAX_HOPS_OUT_OF_BOUNDS:{max_hops}")
    if limit <= 0 or limit > max_visited_nodes:
        raise ValueError(f"LIMIT_EXCEEDS_MAX_VISITED_NODES:{limit}>{max_visited_nodes}")

    bounded_seeds = [str(s).strip() for s in seed_ids[:max_seeds] if str(s).strip()]
    if not bounded_seeds:
        raise ValueError("NO_VALID_SEED_IDS")

    cypher = (
        f"MATCH p = (seed:Symbol)-[:CALLS|IMPORTS*1..{int(max_hops)}]->(neighbor:Symbol)\n"
        "WHERE seed.candidate_id IN $seed_ids\n"
        "  AND ALL(r IN relationships(p) WHERE r.status = 'ADMITTED' AND r.workspace_revision = $revision)\n"
        "  AND ALL(n IN nodes(p) WHERE n.workspace_revision = $revision)\n"
        "RETURN seed.candidate_id AS source_candidate,\n"
        "       neighbor.candidate_id AS neighbor_candidate,\n"
        "       relationships(p) AS evidence_edges,\n"
        "       length(p) AS hop_count\n"
        "LIMIT $limit"
    )
    return {
        "cypher": cypher,
        "params": {
            "seed_ids": bounded_seeds,
            "revision": workspace_revision,
            "limit": int(limit),
            "max_visited_nodes": int(max_visited_nodes),
        },
        "canonical_authority": False,
    }


def assemble_ace_context_manifest_v2(
    *,
    task_id: str,
    workspace_revision: str,
    embedding_model_revision: str,
    strategy: str,
    candidates: Sequence[Mapping[str, Any]],
    ordinal_map_digest: str,
    top_k: int = 20,
) -> dict[str, Any]:
    """Assemble and authority-validate an ACE ContextManifest v2 packet.

    `proof_usable` is computed strictly by checking that at least one candidate
    has `admission == 'REVIEWED'`, non-empty `source_revision`, `evidence_refs`,
    and matching `workspace_revision`.
    """
    if not task_id.strip() or not workspace_revision.strip() or not ordinal_map_digest.strip():
        raise ValueError("ACE_MANIFEST_PROVENANCE_REQUIRED")

    bounded = list(candidates[:top_k])
    all_valid = len(bounded) > 0
    for c in bounded:
        if (
            c.get("admission") != "REVIEWED"
            or not str(c.get("source_revision") or "").strip()
            or not c.get("evidence_refs")
            or c.get("workspace_revision") != workspace_revision
        ):
            all_valid = False
            break

    manifest = {
        "schema_version": "ace-context-v2",
        "task_id": task_id,
        "workspace_revision": workspace_revision,
        "embedding_model_revision": embedding_model_revision,
        "retrieval": {"strategy": strategy, "top_k": int(top_k)},
        "candidates": bounded,
        "ordinal_map_digest": ordinal_map_digest,
        "proof_usable": bool(all_valid),
        "canonical_authority": False,
    }
    manifest["manifest_sha256"] = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    return manifest
