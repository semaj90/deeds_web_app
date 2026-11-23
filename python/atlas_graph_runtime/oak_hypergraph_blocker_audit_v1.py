"""Read-only Valkey HyperLogLog (PFCOUNT) inspector & OaK/HyperGraphRAG blocker audit.

Provides:
1. `inspect_valkey_hll_cardinality_v1(keys, ...)` — zero-dependency RESP2 `PFCOUNT`
   inspection over Valkey/Redis (`monitoringOnly: True`, `canonicalAuthority: False`).
   Per `AGENTS.md`, HyperLogLog estimates cardinality for observability only and
   never determines exact identity, deduplication, or authorization.
2. `audit_oak_hypergraph_blockers_v1(...)` — live read-only check of the remaining
   human/operator-gated blockers across PG18, Valkey HLL, and frozen eval artifacts.
"""
from __future__ import annotations

import json
import os
import socket
from pathlib import Path
from typing import Any


def _resp_pfcount(host: str, port: int, key: str, timeout_s: float = 2.0) -> int | None:
    """Send a minimal RESP2 `PFCOUNT <key>` command over TCP and parse integer reply."""
    key_b = key.encode("utf-8")
    cmd = b"*2\r\n$7\r\nPFCOUNT\r\n$" + str(len(key_b)).encode("ascii") + b"\r\n" + key_b + b"\r\n"
    with socket.create_connection((host, port), timeout=timeout_s) as sock:
        sock.sendall(cmd)
        data = sock.recv(1024).decode("utf-8", errors="replace").strip()
    if data.startswith(":"):
        return int(data[1:].splitlines()[0])
    return None


def inspect_valkey_hll_cardinality_v1(
    keys: list[str],
    *,
    host: str = "127.0.0.1",
    port: int = 6379,
    timeout_s: float = 2.0,
) -> dict[str, Any]:
    """Inspect approximate distinct counts via Valkey PFCOUNT (monitoring only)."""
    if not keys:
        raise ValueError("HLL_KEYS_EMPTY")
    counts: dict[str, int | None] = {}
    reachable = True
    error: str | None = None
    for key in keys[:20]:
        try:
            counts[key] = _resp_pfcount(host, port, key, timeout_s=timeout_s)
        except Exception as exc:
            reachable = False
            error = f"{type(exc).__name__}: {exc}"
            counts[key] = None
            break
    return {
        "schema": "atlas.valkey-hll-inspect.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "monitoringOnly": True,
        "identityOrAuthAllowed": False,
        "reachable": reachable,
        "endpoint": f"{host}:{port}",
        "counts": counts,
        "error": error,
    }


def audit_oak_hypergraph_blockers_v1(
    *,
    dsn: str | None = None,
    eval_path: str | Path = "docs/reports/reviewed-task-eval-set-v1.jsonl",
    grpo_path: str | Path = "docs/reports/doc14-grpo-pairs-v1.jsonl",
    hll_keys: list[str] | None = None,
) -> dict[str, Any]:
    """Run a read-only live audit of operator-gated OaK 2026 / HyperGraphRAG / QLoRA blockers."""
    import psycopg

    db_url = dsn or os.environ.get(
        "DATABASE_URL",
        "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db",
    )
    pg_counts: dict[str, int] = {}
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            queries = {
                "nonEmptyChunksWith768": "SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL AND length(coalesce(content, '')) > 0",
                "emptyPlaceholdersWithout768": "SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding_768 IS NULL AND length(coalesce(content, '')) = 0",
                "eg2ChallengerRows": "SELECT COUNT(*) FROM codebase_chunk_eg2_embeddings WHERE embedding IS NOT NULL",
                "ontologyConcepts": "SELECT COUNT(*) FROM atlas_ontology_concepts",
                "ontologyRelations": "SELECT COUNT(*) FROM atlas_ontology_relations",
                "ontologyLinkedTuples": "SELECT COUNT(*) FROM atlas_ontology_linked_tuples",
                "qloraExamples": "SELECT COUNT(*) FROM qlora_examples",
                "packetsWithNeo4jNodeId": "SELECT COUNT(*) FROM atlas_packets WHERE neo4j_node_id IS NOT NULL",
            }
            for name, sql in queries.items():
                cur.execute(sql)
                pg_counts[name] = int(cur.fetchone()[0])

    eval_p = Path(eval_path)
    eval_rows = [json.loads(l) for l in eval_p.read_text(encoding="utf-8").splitlines() if l.strip()] if eval_p.exists() else []
    pending_eval = sum(1 for r in eval_rows if (r.get("reviewStatus") or r.get("status")) == "PENDING_HUMAN_REVIEW")

    grpo_p = Path(grpo_path)
    grpo_rows = sum(1 for l in grpo_p.read_text(encoding="utf-8").splitlines() if l.strip()) if grpo_p.exists() else 0

    hll = inspect_valkey_hll_cardinality_v1(
        hll_keys or ["atlas:hll:packets:observed", "atlas:hll:chunks:semantic_768"]
    )

    blockers: list[dict[str, Any]] = []
    if pg_counts["ontologyConcepts"] == 0 or pg_counts["ontologyRelations"] == 0:
        blockers.append({"id": "ONTOLOGY_ADMISSION_EMPTY", "owner": "human_reviewer", "detail": "atlas_ontology_concepts/relations/linked_tuples have 0 ADMITTED rows."})
    if pending_eval > 0:
        blockers.append({"id": "EVAL_SET_PENDING_HUMAN_REVIEW", "owner": "human_reviewer", "detail": f"{pending_eval}/{len(eval_rows)} groups in {eval_path} await review."})
    if pg_counts["qloraExamples"] == 0:
        blockers.append({"id": "QLORA_EXAMPLES_EMPTY", "owner": "operator_dataset_gate", "detail": "qlora_examples has 0 rows; only 3 seed pairs in doc14-grpo-pairs-v1.jsonl."})
    if pg_counts["emptyPlaceholdersWithout768"] > 0:
        blockers.append({"id": "EMPTY_PLACEHOLDER_CHUNKS_MARKED_ELIGIBLE", "owner": "operator_db_cleanup", "detail": f"{pg_counts['emptyPlaceholdersWithout768']} empty-content rows have NULL content_embedding_768."})

    return {
        "schema": "atlas.oak-hypergraph-blocker-audit.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "transactionReadOnly": True,
        "postgresCounts": pg_counts,
        "evalGroupsTotal": len(eval_rows),
        "evalGroupsPendingReview": pending_eval,
        "grpoSeedPairs": grpo_rows,
        "valkeyHllTelemetry": hll,
        "openBlockers": blockers,
    }
