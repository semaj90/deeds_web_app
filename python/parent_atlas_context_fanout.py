#!/usr/bin/env python3
"""Read-only Parent Atlas contextual fanout reference.

Inputs are JSON on stdin. The script can compose fixture candidates without any
services, or (when explicitly requested) perform bounded read-only Qdrant and
Neo4j fanout. NetworkX is the structural reference. PyTorch is optional and is
used only for batched cosine/softmax scoring when available; NumPy/pure Python
semantics remain the reference.

This worker never writes Qdrant, Neo4j, Postgres, source files, or model weights.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import sys
from dataclasses import dataclass
from typing import Any, Iterable


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    ln = math.sqrt(sum(a * a for a in left))
    rn = math.sqrt(sum(b * b for b in right))
    if ln == 0 or rn == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (ln * rn)))


def stable_softmax(logits: list[float], temperature: float) -> list[float]:
    if not logits:
        return []
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("temperature must be finite and positive")
    scaled = [x / temperature for x in logits]
    maximum = max(scaled)
    exps = [math.exp(x - maximum) for x in scaled]
    total = sum(exps)
    return [x / total for x in exps] if total else [1.0 / len(exps)] * len(exps)


@dataclass(frozen=True)
class Candidate:
    canonical_id: str
    parent_canonical_id: str | None
    depth: int
    source: str
    cosine_similarity: float | None
    structural_affinity: float | None
    sparse_lexical_affinity: float | None
    graph_authority: float | None
    tool_relevance: float | None
    evidence_refs: tuple[str, ...]

    def key(self) -> tuple[str, str]:
        return (self.parent_canonical_id or "<root>", self.canonical_id)


def parse_candidate(raw: dict[str, Any]) -> Candidate:
    return Candidate(
        canonical_id=str(raw["canonicalId"]),
        parent_canonical_id=(str(raw["parentCanonicalId"]) if raw.get("parentCanonicalId") else None),
        depth=max(0, int(raw.get("depth", 0))),
        source=str(raw.get("source", "NETWORKX_REFERENCE")),
        cosine_similarity=(float(raw["cosineSimilarity"]) if raw.get("cosineSimilarity") is not None else None),
        structural_affinity=(clamp01(raw["structuralAffinity"]) if raw.get("structuralAffinity") is not None else None),
        sparse_lexical_affinity=(clamp01(raw["sparseLexicalAffinity"]) if raw.get("sparseLexicalAffinity") is not None else None),
        graph_authority=(clamp01(raw["graphAuthority"]) if raw.get("graphAuthority") is not None else None),
        tool_relevance=(clamp01(raw["toolRelevance"]) if raw.get("toolRelevance") is not None else None),
        evidence_refs=tuple(sorted(set(map(str, raw.get("evidenceRefs", []))))),
    )


def merge_candidates(rows: Iterable[Candidate]) -> list[Candidate]:
    merged: dict[tuple[str, str], Candidate] = {}

    def max_optional(a: float | None, b: float | None) -> float | None:
        if a is None:
            return b
        if b is None:
            return a
        return max(a, b)

    for row in rows:
        key = row.key()
        prior = merged.get(key)
        if prior is None:
            merged[key] = row
            continue
        merged[key] = Candidate(
            canonical_id=prior.canonical_id,
            parent_canonical_id=prior.parent_canonical_id,
            depth=min(prior.depth, row.depth),
            source=prior.source,
            cosine_similarity=max_optional(prior.cosine_similarity, row.cosine_similarity),
            structural_affinity=max_optional(prior.structural_affinity, row.structural_affinity),
            sparse_lexical_affinity=max_optional(prior.sparse_lexical_affinity, row.sparse_lexical_affinity),
            graph_authority=max_optional(prior.graph_authority, row.graph_authority),
            tool_relevance=max_optional(prior.tool_relevance, row.tool_relevance),
            evidence_refs=tuple(sorted(set(prior.evidence_refs) | set(row.evidence_refs))),
        )
    return sorted(merged.values(), key=lambda x: (x.depth, x.key()))


async def qdrant_fanout(config: dict[str, Any]) -> list[Candidate]:
    if not config.get("enabled"):
        return []
    try:
        from qdrant_client import AsyncQdrantClient
    except Exception as exc:
        raise RuntimeError(f"qdrant_client unavailable: {exc}") from exc

    query_vector = config.get("queryVector")
    if not isinstance(query_vector, list) or not query_vector:
        raise ValueError("Qdrant fanout requires queryVector")
    url = str(config.get("url") or os.environ.get("QDRANT_URL") or "http://127.0.0.1:6333")
    collection = str(config["collection"])
    using = config.get("using")
    limit = max(1, min(int(config.get("limit", 32)), 4096))
    parent = config.get("parentCanonicalId")

    client = AsyncQdrantClient(url=url)
    try:
        response = await client.query_points(
            collection_name=collection,
            query=[float(x) for x in query_vector],
            using=str(using) if using else None,
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )
        points = response.points or []
        out: list[Candidate] = []
        for point in points:
            payload = point.payload or {}
            canonical = payload.get("stable_symbol_id") or payload.get("packet_key") or payload.get("symbol_version_id")
            if not canonical:
                continue
            score = float(point.score) if point.score is not None else None
            out.append(Candidate(
                canonical_id=str(canonical),
                parent_canonical_id=str(parent) if parent else None,
                depth=int(config.get("depth", 1)),
                source="QDRANT_FANOUT",
                cosine_similarity=max(-1.0, min(1.0, score)) if score is not None else None,
                structural_affinity=None,
                sparse_lexical_affinity=None,
                graph_authority=None,
                tool_relevance=None,
                evidence_refs=(f"qdrant:{collection}:{point.id}",),
            ))
        return out
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            result = close()
            if asyncio.iscoroutine(result):
                await result


async def neo4j_fanout(config: dict[str, Any]) -> list[Candidate]:
    if not config.get("enabled"):
        return []
    try:
        from neo4j import AsyncGraphDatabase, RoutingControl
    except Exception as exc:
        raise RuntimeError(f"neo4j unavailable: {exc}") from exc

    uri = str(config.get("uri") or os.environ.get("NEO4J_URI") or "bolt://127.0.0.1:7687")
    user = str(config.get("user") or os.environ.get("NEO4J_USER") or "neo4j")
    password = str(config.get("password") or os.environ.get("NEO4J_PASSWORD") or "")
    database = config.get("database") or os.environ.get("NEO4J_DATABASE")
    seeds = [str(x) for x in config.get("seedCanonicalIds", [])]
    limit = max(1, min(int(config.get("limit", 32)), 4096))
    if not seeds:
        return []

    # Read-only bounded 1-hop neighborhood. Relationship types are returned as
    # evidence; semantic meaning stays with the canonical graph owner.
    cypher = """
    UNWIND $seeds AS seed
    MATCH (s {canonicalId: seed})-[r]-(n)
    WITH seed, n, type(r) AS rel
    WHERE n.canonicalId IS NOT NULL
    RETURN seed, n.canonicalId AS canonicalId, rel,
           coalesce(n.pagerank, n.pageRankScore, 0.0) AS authority
    ORDER BY seed, canonicalId, rel
    LIMIT $limit
    """
    async with AsyncGraphDatabase.driver(uri, auth=(user, password)) as driver:
        records, _summary, _keys = await driver.execute_query(
            cypher,
            seeds=seeds,
            limit=limit,
            database_=str(database) if database else None,
            routing_=RoutingControl.READ,
        )

    return [Candidate(
        canonical_id=str(record["canonicalId"]),
        parent_canonical_id=str(record["seed"]),
        depth=1,
        source="NEO4J_NEIGHBORHOOD",
        cosine_similarity=None,
        structural_affinity=1.0,
        sparse_lexical_affinity=None,
        graph_authority=clamp01(float(record["authority"] or 0.0)),
        tool_relevance=None,
        evidence_refs=(f"neo4j:{record['seed']}:{record['rel']}:{record['canonicalId']}",),
    ) for record in records]


def networkx_reference(rows: list[Candidate], seeds: list[str], max_depth: int) -> list[Candidate]:
    try:
        import networkx as nx
    except Exception:
        return rows

    graph = nx.DiGraph()
    for row in rows:
        graph.add_node(row.canonical_id)
        if row.parent_canonical_id:
            graph.add_edge(row.parent_canonical_id, row.canonical_id)

    reachable: set[str] = set(seeds)
    for seed in seeds:
        if seed not in graph:
            continue
        reachable.update(nx.single_source_shortest_path_length(graph, seed, cutoff=max_depth).keys())
    return [row for row in rows if row.canonical_id in reachable or row.parent_canonical_id in reachable]


def score(rows: list[Candidate], weights: dict[str, float], temperature: float, max_children: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[Candidate]] = {}
    for row in rows:
        grouped.setdefault(row.parent_canonical_id or "<root>", []).append(row)

    out: list[dict[str, Any]] = []
    for parent, children in sorted(grouped.items()):
        logits: list[float] = []
        for child in children:
            cosine01 = ((child.cosine_similarity + 1.0) / 2.0) if child.cosine_similarity is not None else 0.0
            logits.append(
                weights.get("cosine", 0.0) * cosine01
                + weights.get("structural", 0.0) * (child.structural_affinity or 0.0)
                + weights.get("lexical", 0.0) * (child.sparse_lexical_affinity or 0.0)
                + weights.get("authority", 0.0) * (child.graph_authority or 0.0)
                + weights.get("tool", 0.0) * (child.tool_relevance or 0.0)
            )
        probabilities = stable_softmax(logits, temperature)
        ranked = sorted(zip(children, logits, probabilities), key=lambda x: (-x[2], x[0].canonical_id))[:max_children]
        for child, logit, probability in ranked:
            out.append({
                "canonicalId": child.canonical_id,
                "parentCanonicalId": child.parent_canonical_id,
                "depth": child.depth,
                "source": child.source,
                "logit": logit,
                "probability": probability,
                "evidenceRefs": list(child.evidence_refs),
            })
    return out


async def main_async(payload: dict[str, Any]) -> dict[str, Any]:
    fixture = [parse_candidate(x) for x in payload.get("fixtureCandidates", [])]
    qdrant_task = asyncio.create_task(qdrant_fanout(payload.get("qdrant", {})))
    neo4j_task = asyncio.create_task(neo4j_fanout(payload.get("neo4j", {})))
    qdrant_rows, neo4j_rows = await asyncio.gather(qdrant_task, neo4j_task)

    merged = merge_candidates([*fixture, *qdrant_rows, *neo4j_rows])
    seeds = [str(x) for x in payload.get("seedCanonicalIds", [])]
    max_depth = max(0, min(int(payload.get("maxDepth", 2)), 32))
    structural = networkx_reference(merged, seeds, max_depth)
    selected = score(
        structural,
        {str(k): float(v) for k, v in payload.get("weights", {}).items()},
        float(payload.get("temperature", 1.0)),
        max(1, min(int(payload.get("maxChildrenPerParent", 16)), 4096)),
    )
    return {
        "schema": "atlas.python-context-fanout-receipt.v1",
        "requestId": str(payload.get("requestId", "unknown")),
        "seedCanonicalIds": seeds,
        "fixtureCount": len(fixture),
        "qdrantCount": len(qdrant_rows),
        "neo4jCount": len(neo4j_rows),
        "mergedCount": len(merged),
        "selectedCount": len(selected),
        "selected": selected,
        "canonicalWrites": False,
    }


def main() -> int:
    payload = json.load(sys.stdin)
    print(json.dumps(asyncio.run(main_async(payload)), sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
