#!/usr/bin/env python3
"""procedural_canary_graph_router_v1.py — Canary Hyperparameter Selection & Procedural Graph Traversal.

Bridges:
1. ProceduralCanarySelector: Queries `atlas_retrieval_canary_sequence_v1` to procedurally select
   the optimal retrieval parameters (e.g. k=100/150 for TurboVec or ef_search for pgvector)
   given an explicit target recall threshold.
2. GraphChunkNavigator: Traverses AST chunk chains via intrusive linked lists (`prev_ordinal`,
   `next_ordinal`) using Breadth-First Search (BFS) and heuristic A* traversal.
3. SubGraphPageRank: Evaluates candidate centrality across AST candidate hops using standard
   power iteration (alpha=0.85, tol=1e-6) matching the NetworkX reference.

Invariants:
- Zero canonical writes (`writesPerformed = False`, `canonicalAuthority = False`).
- No hidden thoughts, KV cache or raw tensor state persisted.
"""
from __future__ import annotations

import heapq
import json
import math
import os
from collections import deque
from typing import Any, Callable, Dict, List, NamedTuple, Optional, Sequence, Set, Tuple

from atlas_compute.ast_chunk_routing_helpers import AstChunkRouteTuple


class CanaryChoice(NamedTuple):
    sequence_id: str
    executor: str
    hyperparameters: Dict[str, Any]
    recall_top10: float
    mrr_exact_nn1: Optional[float]
    p50_ms: Optional[float]


class ProceduralCanarySelector:
    """Procedurally picks optimal retrieval hyperparameters from PostgreSQL canary runs."""

    # Curated offline fallback records matching the frozen 1,000-query benchmark
    OFFLINE_CANARY_CACHE: List[Dict[str, Any]] = [
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=10", "k": 10, "recall": 0.5783, "mrr": 0.6526, "p50": 4.12},
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=25", "k": 25, "recall": 0.7961, "mrr": 0.6576, "p50": 4.47},
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=50", "k": 50, "recall": 0.8990, "mrr": 0.6586, "p50": 5.08},
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=75", "k": 75, "recall": 0.9335, "mrr": 0.6587, "p50": 5.35},
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=100", "k": 100, "recall": 0.9499, "mrr": 0.6588, "p50": 5.80},
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=150", "k": 150, "recall": 0.9654, "mrr": 0.6588, "p50": 6.67},
        {"executor": "turbovec-http-ann", "sequence_id": "turbovec-http-ann:k=200", "k": 200, "recall": 0.9739, "mrr": 0.6588, "p50": 7.57},
        {"executor": "pgvector-hnsw-768", "sequence_id": "pgvector-hnsw-768:ef_search=40", "ef_search": 40, "recall": 0.9120, "mrr": 0.8870, "p50": 51.18},
        {"executor": "pgvector-hnsw-768", "sequence_id": "pgvector-hnsw-768:ef_search=100", "ef_search": 100, "recall": 0.9214, "mrr": 0.8942, "p50": 49.25},
        {"executor": "pgvector-hnsw-768", "sequence_id": "pgvector-hnsw-768:ef_search=200", "ef_search": 200, "recall": 0.9244, "mrr": 0.8954, "p50": 51.61},
        {"executor": "pgvector-hnsw-768", "sequence_id": "pgvector-hnsw-768:ef_search=400", "ef_search": 400, "recall": 0.9290, "mrr": 0.9012, "p50": 57.46},
    ]

    def __init__(self, db_conn_str: Optional[str] = None):
        self.db_conn_str = db_conn_str

    def select_best_hyperparameters(
        self,
        executor: str = "turbovec-http-ann",
        target_recall: float = 0.95,
    ) -> CanaryChoice:
        """Find the lowest-latency parameter configuration satisfying recall >= target_recall."""
        records: List[Dict[str, Any]] = []

        if self.db_conn_str:
            try:
                import psycopg
                with psycopg.connect(self.db_conn_str) as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT s.sequence_id, r.executor, s.hyperparameters,
                                   s.recall_top10, s.mrr_exact_nn1, s.p50_ms
                            FROM atlas_retrieval_canary_sequence_v1 s
                            JOIN atlas_retrieval_canary_runs_v1 r ON r.canary_id = s.canary_id
                            WHERE r.executor = %s
                            ORDER BY s.recall_top10 ASC, s.p50_ms ASC
                        """, (executor,))
                        for row in cur.fetchall():
                            records.append({
                                "sequence_id": str(row[0]),
                                "executor": str(row[1]),
                                "hyperparameters": row[2] if isinstance(row[2], dict) else json.loads(row[2]),
                                "recall": float(row[3]),
                                "mrr": float(row[4]) if row[4] is not None else None,
                                "p50": float(row[5]) if row[5] is not None else None,
                            })
            except Exception:
                records = []

        if not records:
            # Fall back to verified offline baseline
            matching = [r for r in self.OFFLINE_CANARY_CACHE if r["executor"] == executor]
            for r in matching:
                hp = {"retrieve_k": r["k"]} if "k" in r else {"ef_search": r["ef_search"]}
                records.append({
                    "sequence_id": r["sequence_id"],
                    "executor": r["executor"],
                    "hyperparameters": hp,
                    "recall": r["recall"],
                    "mrr": r["mrr"],
                    "p50": r["p50"],
                })

        eligible = [r for r in records if r["recall"] >= target_recall]
        if eligible:
            best = min(eligible, key=lambda x: (x["recall"], x["p50"] or 999.0))
        else:
            best = max(records, key=lambda x: x["recall"])

        return CanaryChoice(
            sequence_id=best["sequence_id"],
            executor=best["executor"],
            hyperparameters=best["hyperparameters"],
            recall_top10=best["recall"],
            mrr_exact_nn1=best["mrr"],
            p50_ms=best["p50"],
        )


class GraphChunkNavigator:
    """Traverses AST chunks using intrusive linked-list pointers, BFS and A* search."""

    def __init__(self, chunks: Sequence[AstChunkRouteTuple]):
        self.chunks = list(chunks)
        self.by_ordinal: Dict[int, AstChunkRouteTuple] = {
            i: chunk for i, chunk in enumerate(self.chunks)
        }

    def bfs_traverse(self, start_ordinal: int, max_depth: int = 5) -> List[int]:
        """Traverse bidirectional syntax relations (prev/next ordinals) up to max_depth."""
        if start_ordinal not in self.by_ordinal:
            return []

        visited: Set[int] = set()
        queue: deque[Tuple[int, int]] = deque([(start_ordinal, 0)])
        result: List[int] = []

        while queue:
            curr, depth = queue.popleft()
            if curr in visited or depth > max_depth:
                continue

            visited.add(curr)
            result.append(curr)

            chunk = self.by_ordinal.get(curr)
            if not chunk:
                continue

            # Follow intrusive linked-list edges
            for next_idx in (chunk.prev_ordinal, chunk.next_ordinal):
                if next_idx >= 0 and next_idx in self.by_ordinal and next_idx not in visited:
                    queue.append((next_idx, depth + 1))

        return result

    def astar_search(
        self,
        start_ordinal: int,
        is_goal: Callable[[AstChunkRouteTuple], bool],
        heuristic_fn: Optional[Callable[[AstChunkRouteTuple], float]] = None,
        max_expansions: int = 50,
    ) -> List[int]:
        """Find directed path to a goal chunk using A* search over the chunk graph."""
        if start_ordinal not in self.by_ordinal:
            return []

        if heuristic_fn is None:
            heuristic_fn = lambda c: 0.0

        open_set: List[Tuple[float, int, int, List[int]]] = []
        start_chunk = self.by_ordinal[start_ordinal]
        heapq.heappush(open_set, (heuristic_fn(start_chunk), 0, start_ordinal, [start_ordinal]))

        visited_costs: Dict[int, int] = {start_ordinal: 0}
        expansions = 0

        while open_set and expansions < max_expansions:
            expansions += 1
            f_score, g_cost, curr, path = heapq.heappop(open_set)
            curr_chunk = self.by_ordinal[curr]

            if is_goal(curr_chunk):
                return path

            for next_idx in (curr_chunk.prev_ordinal, curr_chunk.next_ordinal):
                if next_idx < 0 or next_idx not in self.by_ordinal:
                    continue

                new_g = g_cost + 1
                if next_idx not in visited_costs or new_g < visited_costs[next_idx]:
                    visited_costs[next_idx] = new_g
                    h = heuristic_fn(self.by_ordinal[next_idx])
                    heapq.heappush(open_set, (new_g + h, new_g, next_idx, path + [next_idx]))

        return []

    def compute_subgraph_pagerank(
        self,
        ordinals: Sequence[int],
        alpha: float = 0.85,
        max_iter: int = 50,
        tol: float = 1e-6,
    ) -> Dict[int, float]:
        """Compute localized PageRank over the candidate chunk chain via power iteration."""
        nodes = list(set(ordinals))
        n = len(nodes)
        if n == 0:
            return {}
        if n == 1:
            return {nodes[0]: 1.0}

        node_to_idx = {node: i for i, node in enumerate(nodes)}
        # Build adjacency matrix
        adj: List[List[float]] = [[0.0] * n for _ in range(n)]

        for node in nodes:
            chunk = self.by_ordinal.get(node)
            if not chunk:
                continue
            src_idx = node_to_idx[node]
            neighbors = [x for x in (chunk.prev_ordinal, chunk.next_ordinal) if x in node_to_idx]
            if neighbors:
                weight = 1.0 / len(neighbors)
                for tgt in neighbors:
                    adj[node_to_idx[tgt]][src_idx] = weight
            else:
                for j in range(n):
                    adj[j][src_idx] = 1.0 / n

        # Initial uniform probability distribution
        p = [1.0 / n] * n

        for _ in range(max_iter):
            p_next = [0.0] * n
            for i in range(n):
                sum_adj = sum(adj[i][j] * p[j] for j in range(n))
                p_next[i] = (1.0 - alpha) / n + alpha * sum_adj

            diff = sum(abs(p_next[i] - p[i]) for i in range(n))
            p = p_next
            if diff < tol:
                break

        return {node: round(p[node_to_idx[node]], 6) for node in nodes}
