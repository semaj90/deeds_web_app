#!/usr/bin/env python3
"""Run the bounded PageRank -> BFS -> PageRank cuGraph orientation proof.

This proof is intentionally non-mutating with respect to canonical Parent Atlas
state. It talks only to the local RAPIDS sidecar and records a JSON receipt.

Important limitation: cuGraph's public Python Graph object does not expose a
reliable post-C-API storage-orientation observer. The storage transitions in
this receipt are therefore *inferred from the canonical cuGraph API contract*,
while execution, timings, results, and GPU-memory samples are observed from the
live sidecar. The receipt never claims a separately measured transpose time.

Canonical API evidence:
- BFS expects non-transposed storage and the C API transposes when necessary:
  https://github.com/rapidsai/cugraph/blob/main/cpp/src/c_api/bfs.cpp
- PageRank expects transposed storage and the C API transposes when necessary:
  https://github.com/rapidsai/cugraph/blob/main/cpp/src/c_api/pagerank.cpp
- High-level PageRank docs state the transposed adjacency is computed if absent:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.pagerank/
- High-level BFS docs expose bounded depth traversal:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.bfs/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SCHEMA = "atlas.cugraph-storage-orientation-sequence-proof.v1"
PAGERANK_REQUIRED = "TRANSPOSED"
BFS_REQUIRED = "NON_TRANSPOSED"
EVIDENCE_MODE = "INFERRED_FROM_CANONICAL_CUGRAPH_API_CONTRACT"

CANONICAL_API_REFS = {
    "bfsPython": "https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.bfs/",
    "bfsCapiSource": "https://github.com/rapidsai/cugraph/blob/main/cpp/src/c_api/bfs.cpp",
    "pagerankPython": "https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.pagerank/",
    "pagerankCapiSource": "https://github.com/rapidsai/cugraph/blob/main/cpp/src/c_api/pagerank.cpp",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def checksum(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def http_json(base_url: str, method: str, path: str, payload: Any | None = None, timeout_s: float = 30.0) -> Any:
    body = None if payload is None else canonical_json(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        method=method,
        headers={"content-type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP_{exc.code}:{path}:{detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"SIDECAR_UNAVAILABLE:{path}:{exc}") from exc


def gpu_memory(health: Any) -> dict[str, Any] | None:
    if not isinstance(health, dict):
        return None
    gpu = health.get("gpu")
    if not isinstance(gpu, dict):
        return None
    memory = gpu.get("memory")
    return memory if isinstance(memory, dict) else None


def max_abs_score_delta(left: list[dict[str, Any]], right: list[dict[str, Any]]) -> float:
    left_by_key = {str(row.get("nodeKey")): float(row.get("score")) for row in left}
    right_by_key = {str(row.get("nodeKey")): float(row.get("score")) for row in right}
    if set(left_by_key) != set(right_by_key):
        return math.inf
    if not left_by_key:
        return 0.0
    return max(abs(left_by_key[key] - right_by_key[key]) for key in left_by_key)


def same_ranked_node_keys(left: list[dict[str, Any]], right: list[dict[str, Any]]) -> bool:
    return [row.get("nodeKey") for row in left] == [row.get("nodeKey") for row in right]


def orientation_sequence() -> list[dict[str, Any]]:
    """Return only what the upstream algorithm contracts justify.

    The first PageRank establishes TRANSPOSED storage after a successful call,
    regardless of unknown initial orientation. BFS then necessarily establishes
    NON_TRANSPOSED storage, and the second PageRank necessarily restores
    TRANSPOSED storage. The last two transitions are therefore forced flips.
    """
    return [
        {
            "phase": "pagerank_1",
            "operation": "personalized_pagerank",
            "orientationBefore": "UNKNOWN_INITIAL",
            "orientationRequired": PAGERANK_REQUIRED,
            "orientationAfter": PAGERANK_REQUIRED,
            "forcedStorageFlip": None,
        },
        {
            "phase": "bfs",
            "operation": "bfs",
            "orientationBefore": PAGERANK_REQUIRED,
            "orientationRequired": BFS_REQUIRED,
            "orientationAfter": BFS_REQUIRED,
            "forcedStorageFlip": True,
        },
        {
            "phase": "pagerank_2",
            "operation": "personalized_pagerank",
            "orientationBefore": BFS_REQUIRED,
            "orientationRequired": PAGERANK_REQUIRED,
            "orientationAfter": PAGERANK_REQUIRED,
            "forcedStorageFlip": True,
        },
    ]


def run(args: argparse.Namespace) -> dict[str, Any]:
    base_url = args.base_url.rstrip("/")
    resident = http_json(base_url, "GET", "/v1/graph/resident", timeout_s=args.timeout_s)
    resident_info = resident.get("resident") if isinstance(resident, dict) else None
    if not isinstance(resident_info, dict):
        raise RuntimeError("GRAPH_NOT_RESIDENT")
    if str(resident_info.get("graphRevision")) != args.graph_revision:
        raise RuntimeError(
            f"GRAPH_REVISION_MISMATCH:{resident_info.get('graphRevision')}:{args.graph_revision}"
        )

    candidate_keys = list(dict.fromkeys(args.candidate_node_key or []))
    pagerank_body = {
        "graphRevision": args.graph_revision,
        "seeds": [{"nodeKey": args.seed_node_key, "weight": 1.0}],
        "candidateNodeKeys": candidate_keys,
        "topK": args.top_k,
        "alpha": 0.85,
        "tol": args.pagerank_tol,
        "maxIter": args.pagerank_max_iter,
        "deadlineMs": args.deadline_ms,
    }
    bfs_body = {
        "graphRevision": args.graph_revision,
        "seedNodeKey": args.seed_node_key,
        "candidateNodeKeys": candidate_keys,
        "maxHops": args.max_hops,
        "maxNodes": args.max_nodes,
        "direction": "outbound",
        "deadlineMs": args.deadline_ms,
    }

    phases: list[dict[str, Any]] = []

    def execute(phase: str, path: str, body: dict[str, Any]) -> Any:
        before_health = http_json(base_url, "GET", "/health", timeout_s=args.timeout_s)
        started = time.perf_counter()
        response = http_json(base_url, "POST", path, body, timeout_s=args.timeout_s)
        wall_ms = (time.perf_counter() - started) * 1000.0
        after_health = http_json(base_url, "GET", "/health", timeout_s=args.timeout_s)
        phases.append(
            {
                "phase": phase,
                "path": path,
                "wallMs": round(wall_ms, 3),
                "reportedKernelMs": (response.get("timings") or {}).get("kernelMs") if isinstance(response, dict) else None,
                "gpuMemoryBefore": gpu_memory(before_health),
                "gpuMemoryAfter": gpu_memory(after_health),
                "responseSchema": response.get("schema") if isinstance(response, dict) else None,
                "backend": response.get("backend") if isinstance(response, dict) else None,
            }
        )
        return response

    pagerank_1 = execute("pagerank_1", "/v1/graph/pagerank", pagerank_body)
    bfs = execute("bfs", "/v1/graph/bfs", bfs_body)
    pagerank_2 = execute("pagerank_2", "/v1/graph/pagerank", pagerank_body)

    pr1_results = pagerank_1.get("results", []) if isinstance(pagerank_1, dict) else []
    pr2_results = pagerank_2.get("results", []) if isinstance(pagerank_2, dict) else []
    repeat_delta = max_abs_score_delta(pr1_results, pr2_results)
    ranked_keys_equal = same_ranked_node_keys(pr1_results, pr2_results)
    repeat_parity = ranked_keys_equal and repeat_delta <= args.repeat_tolerance

    gates = {
        "GRAPH_REVISION_STABLE": all(
            isinstance(response, dict) and response.get("graphRevision") == args.graph_revision
            for response in (pagerank_1, bfs, pagerank_2)
        ),
        "PAGERANK_1_EXECUTED": isinstance(pagerank_1, dict)
        and pagerank_1.get("schema") == "atlas.graph-pagerank-receipt.v1",
        "BFS_EXECUTED": isinstance(bfs, dict) and bfs.get("schema") == "atlas.graph-bfs-receipt.v1",
        "PAGERANK_2_EXECUTED": isinstance(pagerank_2, dict)
        and pagerank_2.get("schema") == "atlas.graph-pagerank-receipt.v1",
        "PAGERANK_REPEAT_PARITY": repeat_parity,
        "STORAGE_ORIENTATION_THRASH_INFERRED": True,
        "TRANSPOSE_TIMING_SEPARATELY_MEASURED": False,
        "CANONICAL_WRITES_ATTEMPTED": False,
    }

    status = "RUNTIME_SEQUENCE_PROVEN_ORIENTATION_THRASH_INFERRED" if all(
        gates[key]
        for key in (
            "GRAPH_REVISION_STABLE",
            "PAGERANK_1_EXECUTED",
            "BFS_EXECUTED",
            "PAGERANK_2_EXECUTED",
            "PAGERANK_REPEAT_PARITY",
        )
    ) else "RUNTIME_SEQUENCE_MISMATCH"

    payload = {
        "schema": SCHEMA,
        "status": status,
        "graphRevision": args.graph_revision,
        "projectionRevision": resident_info.get("projectionRevision"),
        "nodeTableHash": resident_info.get("nodeTableHash"),
        "edgeTableHash": resident_info.get("edgeTableHash"),
        "seedNodeKey": args.seed_node_key,
        "candidateFilterCount": len(candidate_keys),
        "orientationEvidenceMode": EVIDENCE_MODE,
        "orientationSequence": orientation_sequence(),
        "minimumForcedStorageFlips": 2,
        "transposeTimingSeparatelyMeasured": False,
        "kernelTimingIncludesPossibleStorageTranspose": True,
        "pagerankRepeat": {
            "sameRankedNodeKeys": ranked_keys_equal,
            "maxAbsScoreDelta": repeat_delta,
            "tolerance": args.repeat_tolerance,
        },
        "phases": phases,
        "gates": gates,
        "canonicalApiRefs": CANONICAL_API_REFS,
        "generatedAtUnixMs": int(time.time() * 1000),
    }
    return {**payload, "receiptChecksum": checksum(payload)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Prove bounded cuGraph PageRank/BFS storage-orientation sequence")
    parser.add_argument("--base-url", default="http://127.0.0.1:8098")
    parser.add_argument("--graph-revision", required=True)
    parser.add_argument("--seed-node-key", required=True)
    parser.add_argument("--candidate-node-key", action="append", default=[])
    parser.add_argument("--top-k", type=int, default=32)
    parser.add_argument("--max-hops", type=int, default=2)
    parser.add_argument("--max-nodes", type=int, default=128)
    parser.add_argument("--deadline-ms", type=int, default=10_000)
    parser.add_argument("--timeout-s", type=float, default=30.0)
    parser.add_argument("--pagerank-tol", type=float, default=1e-6)
    parser.add_argument("--pagerank-max-iter", type=int, default=100)
    parser.add_argument("--repeat-tolerance", type=float, default=1e-7)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    receipt = run(args)
    text = json.dumps(receipt, indent=2, sort_keys=True, allow_nan=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if receipt["status"] == "RUNTIME_SEQUENCE_PROVEN_ORIENTATION_THRASH_INFERRED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
