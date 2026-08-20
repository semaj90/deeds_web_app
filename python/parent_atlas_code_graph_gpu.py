#!/usr/bin/env python3
"""Read-only GPU graph adapter for deeds_lab code archaeology JSONL.

This module turns the generated `nodes.jsonl` / `edges.jsonl` artifacts into a
cuDF edge list and cuGraph graph for bounded analysis. It never edits source
files and never writes canonical Atlas state.

Intended uses:
- PageRank/HITS/community features over code archaeology relationships,
- bounded BFS around an error/source seed,
- selecting repair-context candidates before exact source hydration,
- producing GPU-derived features for the existing CandidateFeatureMatrix.

CUDA Graphs are a separate execution optimization and are intentionally not
conflated with this semantic code graph.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class CodeGraphPaths:
    nodes_jsonl: Path
    edges_jsonl: Path


@dataclass(frozen=True)
class CodeGraphGpuSnapshot:
    nodes: Any
    edges: Any
    ordinal_map: Any
    graph: Any


def default_paths(repo_root: str | Path) -> CodeGraphPaths:
    root = Path(repo_root).resolve() / "deeds_lab" / "parent-atlas-code-graph"
    return CodeGraphPaths(nodes_jsonl=root / "nodes.jsonl", edges_jsonl=root / "edges.jsonl")


def _require_files(paths: CodeGraphPaths) -> None:
    missing = [str(path) for path in (paths.nodes_jsonl, paths.edges_jsonl) if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            "deeds_lab code graph has not been generated yet; missing: " + ", ".join(missing)
        )


def load_code_graph_gpu(paths: CodeGraphPaths) -> CodeGraphGpuSnapshot:
    """Load generated JSONL and create a deterministic integer-ordinal cuGraph.

    The external SHA-256 `assetId` remains canonical for the archaeology artifact.
    Integer `ordinal` exists only because GPU graph primitives are more efficient
    with compact integer vertices. The mapping is explicit and reversible.
    """
    _require_files(paths)

    import cupy as cp
    import cudf
    import cugraph

    nodes = cudf.read_json(str(paths.nodes_jsonl), engine="cudf", lines=True)
    edges = cudf.read_json(str(paths.edges_jsonl), engine="cudf", lines=True)

    if "assetId" not in nodes.columns:
        raise ValueError("nodes.jsonl missing assetId")
    for name in ("fromAssetId", "toAssetId", "relation", "confidence"):
        if name not in edges.columns:
            raise ValueError(f"edges.jsonl missing {name}")

    # Sort before assigning ordinals so the mapping is independent of JSONL
    # emission order. assetId remains available for the return projection.
    asset_ids = nodes[["assetId"]].drop_duplicates().sort_values("assetId").reset_index(drop=True)
    asset_ids["ordinal"] = cp.arange(len(asset_ids), dtype=cp.int64)
    ordinal_map = asset_ids

    source_map = ordinal_map.rename(columns={"assetId": "fromAssetId", "ordinal": "src"})
    target_map = ordinal_map.rename(columns={"assetId": "toAssetId", "ordinal": "dst"})
    gpu_edges = edges.merge(source_map, on="fromAssetId", how="inner").merge(target_map, on="toAssetId", how="inner")

    graph = cugraph.Graph(directed=True)
    graph.from_cudf_edgelist(
        gpu_edges,
        source="src",
        destination="dst",
        edge_attr="confidence",
        renumber=False,
        store_transposed=False,
        vertices=ordinal_map["ordinal"],
    )
    return CodeGraphGpuSnapshot(nodes=nodes, edges=gpu_edges, ordinal_map=ordinal_map, graph=graph)


def asset_id_to_ordinal(snapshot: CodeGraphGpuSnapshot, asset_id: str) -> int:
    match = snapshot.ordinal_map[snapshot.ordinal_map["assetId"] == asset_id]
    if len(match) != 1:
        raise KeyError(asset_id)
    return int(match["ordinal"].iloc[0])


def attach_asset_ids(snapshot: CodeGraphGpuSnapshot, frame: Any, vertex_column: str = "vertex") -> Any:
    """Join a cuGraph result's compact vertex ordinal back to source assetId."""
    mapping = snapshot.ordinal_map.rename(columns={"ordinal": vertex_column})
    return frame.merge(mapping, on=vertex_column, how="left")


def pagerank_features(
    snapshot: CodeGraphGpuSnapshot,
    *,
    alpha: float = 0.85,
    max_iter: int = 100,
    tol: float = 1.0e-5,
) -> Any:
    import cugraph

    result = cugraph.pagerank(
        snapshot.graph,
        alpha=alpha,
        max_iter=max_iter,
        tol=tol,
        fail_on_nonconvergence=True,
    )
    return attach_asset_ids(snapshot, result)


def bounded_bfs(
    snapshot: CodeGraphGpuSnapshot,
    seed_asset_id: str,
    *,
    depth_limit: int = 2,
) -> Any:
    """Return a bounded graph neighborhood for repair/context expansion."""
    if depth_limit < 0:
        raise ValueError("depth_limit must be non-negative")

    import cugraph

    seed = asset_id_to_ordinal(snapshot, seed_asset_id)
    result = cugraph.bfs(snapshot.graph, start=seed, depth_limit=depth_limit)
    reachable = result[result["distance"] >= 0]
    return attach_asset_ids(snapshot, reachable)


def repair_seed_asset_ids(snapshot: CodeGraphGpuSnapshot, source_refs: Iterable[str]) -> list[str]:
    """Map exact source_ref values to repair-candidate graph nodes."""
    wanted = {str(value).replace("\\", "/").lstrip("./") for value in source_refs if str(value).strip()}
    if not wanted:
        return []

    nodes = snapshot.nodes
    # cuDF isin handles a small host list well for this bounded selection.
    selected = nodes[nodes["sourceRef"].isin(sorted(wanted))]
    if "repairEvidenceCandidate" in selected.columns:
        selected = selected[selected["repairEvidenceCandidate"] == True]  # noqa: E712
    return sorted({str(value) for value in selected["assetId"].to_pandas().tolist()})


def repair_context(
    snapshot: CodeGraphGpuSnapshot,
    source_refs: Iterable[str],
    *,
    depth_limit: int = 2,
    top_k: int = 128,
) -> dict[str, Any]:
    """Build a bounded GPU graph context nomination for agentic error fixing.

    This is a nomination only. Exact source hydration, AST/compiler validation,
    mutation CAS, tests, and rollback remain host/DAG responsibilities.
    """
    if top_k <= 0:
        raise ValueError("top_k must be positive")

    seeds = repair_seed_asset_ids(snapshot, source_refs)
    if not seeds:
        return {
            "schema": "atlas.code-repair-gpu-context.v1",
            "seedAssetIds": [],
            "candidateAssetIds": [],
            "canonicalWritesAllowed": False,
            "exactSourceHydrationRequired": True,
        }

    distances: dict[str, int] = {}
    for seed in seeds:
        frame = bounded_bfs(snapshot, seed, depth_limit=depth_limit)
        pdf = frame[["assetId", "distance"]].to_pandas()
        for row in pdf.itertuples(index=False):
            asset_id = str(row.assetId)
            distance = int(row.distance)
            current = distances.get(asset_id)
            if current is None or distance < current:
                distances[asset_id] = distance

    # Deterministic graph-local ranking: shortest BFS distance, seed membership,
    # then stable assetId. PageRank can be added later as a feature, not authority.
    ordered = sorted(
        distances,
        key=lambda asset_id: (
            distances[asset_id],
            0 if asset_id in seeds else 1,
            asset_id,
        ),
    )[:top_k]

    return {
        "schema": "atlas.code-repair-gpu-context.v1",
        "seedAssetIds": seeds,
        "candidateAssetIds": ordered,
        "distanceByAssetId": {asset_id: distances[asset_id] for asset_id in ordered},
        "depthLimit": depth_limit,
        "topK": top_k,
        "graphExecutor": "CUGRAPH_GPU",
        "logicalLane": "ast_graph_context",
        "logicalLaneVoteAdded": False,
        "canonicalWritesAllowed": False,
        "exactSourceHydrationRequired": True,
        "mutationDagAuthorizationRequired": True,
    }


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Read-only Parent Atlas code archaeology GPU graph probe")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--source-ref", action="append", default=[])
    parser.add_argument("--depth", type=int, default=2)
    parser.add_argument("--top-k", type=int, default=128)
    parser.add_argument("--pagerank", action="store_true")
    args = parser.parse_args()

    snapshot = load_code_graph_gpu(default_paths(args.repo_root))
    output: dict[str, Any] = {
        "nodes": int(len(snapshot.nodes)),
        "edges": int(len(snapshot.edges)),
        "canonicalWritesAllowed": False,
    }
    if args.source_ref:
        output["repairContext"] = repair_context(
            snapshot,
            args.source_ref,
            depth_limit=args.depth,
            top_k=args.top_k,
        )
    if args.pagerank:
        pr = pagerank_features(snapshot)
        output["topPageRank"] = pr.nlargest(min(20, len(pr)), "pagerank")[["assetId", "pagerank"]].to_pandas().to_dict("records")
    print(json.dumps(output, indent=2))
