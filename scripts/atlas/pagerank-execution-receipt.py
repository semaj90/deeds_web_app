#!/usr/bin/env python3
"""Shared receipt helpers for Parent Atlas PageRank executors.

Intended for `cugraph-pagerank.py`, NetworkX fixtures, and future Neo4j-GDS
adapters. It does not compute PageRank or write the database; it canonicalizes
projection/config/result identity so different backends can be compared fairly.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Iterable, Mapping


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_json(value: object) -> str:
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()


def build_pagerank_execution_receipt(
    *,
    backend: str,
    graph_revision: str,
    projection_revision: str,
    edges: Iterable[tuple[str, str]],
    scores: Mapping[str, float],
    alpha: float,
    max_iter: int,
    tol: float,
    personalization: Mapping[str, float] | None = None,
    normalization: str = "none",
    producer_revision: str = "pagerank-execution-receipt-v1",
) -> dict:
    normalized_edges = sorted([list(edge) for edge in edges])
    normalized_scores = [
        {"nodeKey": key, "pagerankRaw": float(scores[key])}
        for key in sorted(scores)
    ]
    normalized_personalization = (
        {key: float(personalization[key]) for key in sorted(personalization)}
        if personalization
        else None
    )
    config = {
        "alpha": float(alpha),
        "max_iter": int(max_iter),
        "tol": float(tol),
        "mode": "personalized" if normalized_personalization else "global",
        "personalization": normalized_personalization,
        "normalization": normalization,
    }
    receipt = {
        "schema": "atlas.pagerank-execution-receipt.v1",
        "backend": backend,
        "graphRevision": graph_revision,
        "projectionRevision": projection_revision,
        "projectionHash": sha256_json(normalized_edges),
        "config": config,
        "configHash": sha256_json(config),
        "resultHash": sha256_json(normalized_scores),
        "nodeCount": len(normalized_scores),
        "edgeCount": len(normalized_edges),
        "computedAt": datetime.now(timezone.utc).isoformat(),
        "producerRevision": producer_revision,
    }
    receipt["checksum"] = sha256_json(receipt)
    return receipt


def assert_receipt_parity(reference: Mapping[str, object], challenger: Mapping[str, object]) -> None:
    for field in ("graphRevision", "projectionRevision", "projectionHash", "configHash"):
        if reference.get(field) != challenger.get(field):
            raise ValueError(f"PageRank parity precondition failed: {field} differs")
