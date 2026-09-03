"""Resident cuGraph PageRank runtime for Parent Atlas.

This module is intentionally an executor over the frozen GRAPH_SNAPSHOT_PARITY
artifact, not a graph authority. PostgreSQL/frozen snapshot identity remains
canonical; this process keeps at most one revision-qualified cuGraph projection
resident and enriches bounded CandidateOrdinal rows with PageRank features.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, Field

try:  # imported lazily-safe so the main sidecar can still report degradation
    import cudf
    import cugraph
except Exception as exc:  # pragma: no cover - runtime environment dependent
    cudf = None  # type: ignore[assignment]
    cugraph = None  # type: ignore[assignment]
    _IMPORT_ERROR: str | None = f"{type(exc).__name__}: {exc}"
else:
    _IMPORT_ERROR = None

_MAX_SEEDS = int(os.getenv("ATLAS_RAPIDS_PPR_MAX_SEEDS", "64"))
_MAX_RESULT_NODES = int(os.getenv("ATLAS_RAPIDS_PPR_MAX_RESULT_NODES", "512"))
_MIN_GRAPH_FREE_GPU_MB = float(os.getenv("ATLAS_RAPIDS_GRAPH_MIN_FREE_GPU_MB", "768"))
_DEFAULT_ALPHA = float(os.getenv("ATLAS_RAPIDS_PAGERANK_ALPHA", "0.85"))
_DEFAULT_TOL = float(os.getenv("ATLAS_RAPIDS_PAGERANK_TOL", "1e-6"))
_DEFAULT_MAX_ITER = int(os.getenv("ATLAS_RAPIDS_PAGERANK_MAX_ITER", "100"))
_ALGORITHM_REVISION = "atlas.cugraph-pagerank.v1"


def _artifact_root() -> Path:
    return Path(os.getenv("ATLAS_GRAPH_ARTIFACT_ROOT", "sveltekit-frontend/docs/reports")).resolve()


def _inside_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _fail(code: str, message: str, status_code: int = 422) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


class GraphLoadRequest(BaseModel):
    artifactDir: str
    expectedGraphRevision: str | None = None
    expectedProjectionRevision: str | None = None
    expectedProjectionChecksum: str | None = None
    expectedArtifactChecksum: str | None = None
    expectedGraphOrdinalMapChecksum: str | None = None
    expectedWorkspaceRevision: str | None = None
    expectedCandidateSnapshotRevision: str | None = None
    replaceResident: bool = False


class PageRankSeed(BaseModel):
    nodeKey: str
    weight: float = 1.0


class PageRankRequest(BaseModel):
    graphRevision: str
    projectionRevision: str | None = None
    projectionChecksum: str | None = None
    seeds: list[PageRankSeed] = Field(default_factory=list)
    candidateNodeKeys: list[str] = Field(default_factory=list)
    topK: int = 128
    alpha: float = _DEFAULT_ALPHA
    tol: float = _DEFAULT_TOL
    maxIter: int = _DEFAULT_MAX_ITER
    deadlineMs: int | None = None
    expectedArtifactChecksum: str | None = None
    expectedGraphOrdinalMapChecksum: str | None = None
    candidateSnapshotRevision: str | None = None
    parameterManifestId: str | None = None
    parameterChecksum: str | None = None


class BFSRequest(BaseModel):
    graphRevision: str
    projectionRevision: str | None = None
    projectionChecksum: str | None = None
    startNodeKey: str
    depthLimit: int = Field(default=8, ge=0, le=64)
    expectedArtifactChecksum: str | None = None
    expectedGraphOrdinalMapChecksum: str | None = None


class ComponentsRequest(BaseModel):
    graphRevision: str
    projectionRevision: str | None = None
    projectionChecksum: str | None = None
    expectedArtifactChecksum: str | None = None
    expectedGraphOrdinalMapChecksum: str | None = None


class JaccardRequest(BaseModel):
    graphRevision: str
    projectionRevision: str | None = None
    projectionChecksum: str | None = None
    vertexPairs: list[tuple[str, str]] = Field(default_factory=list)
    expectedArtifactChecksum: str | None = None
    expectedGraphOrdinalMapChecksum: str | None = None


def normalize_seed_pairs(seeds: list[tuple[str, float]]) -> list[tuple[str, float]]:
    if not seeds:
        return []
    if len(seeds) > _MAX_SEEDS:
        raise ValueError(f"seed count {len(seeds)} > max {_MAX_SEEDS}")
    seen: set[str] = set()
    cleaned: list[tuple[str, float]] = []
    total = 0.0
    for node_key, raw_weight in seeds:
        node_key = str(node_key).strip()
        weight = float(raw_weight)
        if not node_key:
            raise ValueError("seed nodeKey must be non-empty")
        if node_key in seen:
            raise ValueError(f"duplicate seed nodeKey: {node_key}")
        if not math.isfinite(weight) or weight <= 0:
            raise ValueError(f"seed weight for {node_key} must be finite and > 0")
        seen.add(node_key)
        cleaned.append((node_key, weight))
        total += weight
    normalized = [(node_key, weight / total) for node_key, weight in cleaned]
    return sorted(normalized, key=lambda item: item[0])


def seed_checksum(seeds: list[tuple[str, float]]) -> str:
    normalized = normalize_seed_pairs(seeds)
    payload = json.dumps(
        [{"nodeKey": node_key, "weight": round(weight, 15)} for node_key, weight in normalized],
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parameter_checksum(alpha: float, tol: float, max_iter: int) -> str:
    payload = json.dumps(
        {"alpha": float(alpha), "tol": float(tol), "maxIter": int(max_iter)},
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class ResidentGraph:
    def __init__(self, artifact_dir: Path, manifest: dict[str, Any]) -> None:
        if cudf is None or cugraph is None:
            raise RuntimeError(_IMPORT_ERROR or "cuGraph unavailable")

        self.artifact_dir = artifact_dir
        self.graph_revision = str(manifest["graphRevision"])
        self.projection_revision = str(manifest["projectionRevision"])
        self.projection_checksum = str(manifest.get("projectionChecksum") or manifest.get("artifactChecksum") or "")
        self.node_table_hash = str(manifest["nodeTableHash"])
        self.edge_table_hash = str(manifest["edgeTableHash"])
        self.producer_revision = str(manifest.get("producerRevision") or "unknown")
        self.workspace_revision = manifest.get("workspaceRevision")
        self.candidate_snapshot_revision = manifest.get("candidateSnapshotRevision")
        self.graph_ordinal_map_checksum = manifest.get("ordinalMapChecksum") or manifest.get("graphOrdinalMapChecksum")
        self.graph_kind = str(manifest.get("graphKind") or "UNKNOWN")
        self.symmetrization_policy = str(manifest.get("symmetrizationPolicy") or "UNSPECIFIED")
        artifact_identity = {
            "graphRevision": self.graph_revision,
            "projectionRevision": self.projection_revision,
            "nodeCount": manifest.get("nodeCount"),
            "edgeCount": manifest.get("edgeCount"),
            "nodeTableHash": self.node_table_hash,
            "edgeTableHash": self.edge_table_hash,
        }
        self.artifact_checksum = str(manifest.get("artifactChecksum") or hashlib.sha256(
            json.dumps(artifact_identity, separators=(",", ":"), sort_keys=True).encode("utf-8")
        ).hexdigest())
        if not self.projection_checksum:
            self.projection_checksum = self.artifact_checksum
        self.loaded_at = time.time()

        nodes_path = artifact_dir / "nodes.parquet"
        edges_path = artifact_dir / "edges.parquet"
        if not nodes_path.is_file() or not edges_path.is_file():
            raise ValueError("nodes.parquet and edges.parquet are required")

        t0 = time.perf_counter()
        identity_gpu = cudf.read_parquet(
            nodes_path,
            columns=["gpu_node_id", "graph_node_key", "packet_key"],
        )
        self.edges_df = cudf.read_parquet(
            edges_path,
            columns=["src_gpu_node_id", "dst_gpu_node_id", "weight"],
        )
        # cugraph.pagerank's precomputed_vertex_out_weight requires a float sums
        # column; parquet exporters commonly emit integer edge weights (this
        # artifact's weight column is int64). Cast once here so both the graph's
        # edge_attr and the out_weight_df built below agree on dtype — confirmed
        # live (2026-08-26) that leaving weight as int64 makes cugraph_pagerank
        # fail with the misleadingly-worded "vertex type of graph and
        # precomputed_vertex_out_weight_sums must match" (the real mismatch is
        # int64 sums vs the float64 cugraph expects, not a vertex dtype at all).
        self.edges_df["weight"] = self.edges_df["weight"].astype("float64")
        self.parquet_read_ms = (time.perf_counter() - t0) * 1000

        self.node_count = len(identity_gpu)
        self.edge_count = len(self.edges_df)
        if self.node_count <= 0:
            raise ValueError("graph projection contains no nodes")
        if int(manifest["nodeCount"]) != self.node_count:
            raise ValueError("manifest nodeCount does not match nodes.parquet")
        if int(manifest["edgeCount"]) != self.edge_count:
            raise ValueError("manifest edgeCount does not match edges.parquet")

        ids = identity_gpu["gpu_node_id"]
        if int(ids.nunique()) != self.node_count or int(ids.min()) != 0 or int(ids.max()) != self.node_count - 1:
            raise ValueError("gpu_node_id must be unique and dense in [0, V)")
        if int(identity_gpu["graph_node_key"].nunique()) != self.node_count:
            raise ValueError("graph_node_key must be unique")

        if self.edge_count > 0:
            if int(self.edges_df["src_gpu_node_id"].min()) < 0 or int(self.edges_df["dst_gpu_node_id"].min()) < 0:
                raise ValueError("edge endpoint below zero")
            if int(self.edges_df["src_gpu_node_id"].max()) >= self.node_count or int(self.edges_df["dst_gpu_node_id"].max()) >= self.node_count:
                raise ValueError("edge endpoint exceeds node table")

        # This is an admission result, not a configuration assumption. The
        # executor uses renumber=False only after the node and edge tables
        # prove the cuGraph ABI: unique ordinals covering [0, V). A future
        # non-dense path must use renumber=True and restore results through
        # the external node-key map before it is admitted.
        self.renumbered = False

        # Keep canonical identity lookup in host RAM; only integer vertex IDs and
        # topology need to remain in VRAM. This avoids paying VRAM for millions of
        # UTF-8 node keys merely to translate <=512 result rows.
        identity_host = identity_gpu.to_pandas()
        self.node_key_to_gpu_id = {
            str(row.graph_node_key): int(row.gpu_node_id)
            for row in identity_host.itertuples(index=False)
        }
        self.gpu_id_to_identity = {
            int(row.gpu_node_id): {
                "nodeKey": str(row.graph_node_key),
                "packetKey": None if row.packet_key is None else str(row.packet_key),
            }
            for row in identity_host.itertuples(index=False)
        }
        vertices = identity_gpu["gpu_node_id"]
        del identity_gpu

        t1 = time.perf_counter()
        self.directed = bool(manifest.get("directed", True))
        self.graph = cugraph.Graph(directed=self.directed)
        if self.edge_count > 0:
            self.graph.from_cudf_edgelist(
                self.edges_df,
                source="src_gpu_node_id",
                destination="dst_gpu_node_id",
                edge_attr="weight",
                vertices=vertices,
                renumber=False,
                store_transposed=True,
            )
        self.graph_build_ms = (time.perf_counter() - t1) * 1000

        t2 = time.perf_counter()
        if self.edge_count > 0:
            self.out_weight_df = (
                self.edges_df.groupby("src_gpu_node_id")["weight"]
                .sum()
                .reset_index()
                .rename(columns={"src_gpu_node_id": "vertex", "weight": "sums"})
            )
        else:
            self.out_weight_df = cudf.DataFrame({"vertex": [], "sums": []})
        self.out_weight_build_ms = (time.perf_counter() - t2) * 1000
        self._global_cache: dict[tuple[float, float, int], Any] = {}

    def resolve_node_keys(self, node_keys: list[str], label: str) -> list[int]:
        if len(node_keys) > _MAX_RESULT_NODES and label == "candidate":
            raise ValueError(f"candidate node count {len(node_keys)} > max {_MAX_RESULT_NODES}")
        ids: list[int] = []
        seen: set[str] = set()
        for raw in node_keys:
            node_key = str(raw).strip()
            if not node_key:
                raise ValueError(f"{label} nodeKey must be non-empty")
            if node_key in seen:
                raise ValueError(f"duplicate {label} nodeKey: {node_key}")
            seen.add(node_key)
            gpu_id = self.node_key_to_gpu_id.get(node_key)
            if gpu_id is None:
                raise KeyError(node_key)
            ids.append(gpu_id)
        return ids

    def pagerank(self, req: PageRankRequest) -> dict[str, Any]:
        if self.edge_count <= 0:
            raise ValueError("PageRank requires at least one edge")
        if req.graphRevision != self.graph_revision:
            raise LookupError(f"resident revision {self.graph_revision} != requested {req.graphRevision}")
        if req.expectedArtifactChecksum and req.expectedArtifactChecksum != self.artifact_checksum:
            raise LookupError("artifact checksum does not match resident graph")
        if req.expectedGraphOrdinalMapChecksum and req.expectedGraphOrdinalMapChecksum != self.graph_ordinal_map_checksum:
            raise LookupError("graph ordinal map checksum does not match resident graph")
        if req.candidateSnapshotRevision and req.candidateSnapshotRevision != self.candidate_snapshot_revision:
            raise LookupError("candidate snapshot revision does not match resident graph")
        if not (0.0 < req.alpha < 1.0):
            raise ValueError("alpha must be > 0 and < 1")
        if not math.isfinite(req.tol) or req.tol <= 0:
            raise ValueError("tol must be finite and > 0")
        if req.maxIter < 1 or req.maxIter > 10_000:
            raise ValueError("maxIter must be in [1, 10000]")
        if req.topK < 1 or req.topK > _MAX_RESULT_NODES:
            raise ValueError(f"topK must be in [1, {_MAX_RESULT_NODES}]")
        if req.deadlineMs is not None and req.deadlineMs <= 0:
            raise TimeoutError("deadlineMs must be positive")
        if bool(req.parameterManifestId) != bool(req.parameterChecksum):
            raise ValueError("parameterManifestId and parameterChecksum must be supplied together")
        computed_parameter_checksum = parameter_checksum(req.alpha, req.tol, req.maxIter)
        if req.parameterChecksum and req.parameterChecksum != computed_parameter_checksum:
            raise ValueError("parameter checksum does not match PageRank parameters")

        normalized_seeds = normalize_seed_pairs([(seed.nodeKey, seed.weight) for seed in req.seeds])
        seed_ids = self.resolve_node_keys([node_key for node_key, _ in normalized_seeds], "seed") if normalized_seeds else []
        candidate_ids = self.resolve_node_keys(req.candidateNodeKeys, "candidate") if req.candidateNodeKeys else []
        checksum = seed_checksum([(seed.nodeKey, seed.weight) for seed in req.seeds])
        started = time.perf_counter()

        personalization = None
        if normalized_seeds:
            weights_by_key = dict(normalized_seeds)
            personalization = cudf.DataFrame(
                {
                    "vertex": seed_ids,
                    "values": [weights_by_key[node_key] for node_key, _ in normalized_seeds],
                }
            )

        cache_key = (float(req.alpha), float(req.tol), int(req.maxIter))
        if personalization is None and cache_key in self._global_cache:
            scores_df = self._global_cache[cache_key]
            cache_hit = True
        else:
            pagerank_kwargs = {
                "alpha": float(req.alpha),
                "personalization": personalization,
                "max_iter": int(req.maxIter),
                "tol": float(req.tol),
                "fail_on_nonconvergence": True,
            }
            # cuGraph's undirected incidence graph has no directed out-weight
            # semantics. Let cuGraph derive the degree weights for that mode;
            # the precomputed directed optimization remains unchanged.
            if self.directed:
                pagerank_kwargs["precomputed_vertex_out_weight"] = self.out_weight_df
            scores_df = cugraph.pagerank(self.graph, **pagerank_kwargs)
            cache_hit = False
            if personalization is None:
                self._global_cache[cache_key] = scores_df

        kernel_ms = (time.perf_counter() - started) * 1000
        if req.deadlineMs is not None and kernel_ms >= req.deadlineMs:
            raise TimeoutError(f"PageRank exceeded deadlineMs ({kernel_ms:.2f} >= {req.deadlineMs})")

        select_started = time.perf_counter()
        if candidate_ids:
            selected = scores_df[scores_df["vertex"].isin(candidate_ids)].sort_values("pagerank", ascending=False)
            if len(selected) != len(candidate_ids):
                raise RuntimeError("PageRank did not return every requested candidate vertex")
        else:
            selected = scores_df.nlargest(req.topK, "pagerank")

        rows = selected[["vertex", "pagerank"]].to_pandas()
        results: list[dict[str, Any]] = []
        for rank, row in enumerate(rows.itertuples(index=False), start=1):
            gpu_node_id = int(row.vertex)
            identity = self.gpu_id_to_identity[gpu_node_id]
            results.append(
                {
                    "rank": rank,
                    "gpuNodeId": gpu_node_id,
                    "nodeKey": identity["nodeKey"],
                    "packetKey": identity["packetKey"],
                    "score": float(row.pagerank),
                }
            )
        result_select_ms = (time.perf_counter() - select_started) * 1000

        return {
            "schema": "atlas.graph-pagerank-receipt.v1",
            "operation": "personalized_pagerank" if normalized_seeds else "pagerank",
            "backend": "cugraph.pagerank",
            "algorithmRevision": _ALGORITHM_REVISION,
            "graphRevision": self.graph_revision,
            "projectionRevision": self.projection_revision,
            "artifactChecksum": self.artifact_checksum,
            "graphOrdinalMapChecksum": self.graph_ordinal_map_checksum,
            "workspaceRevision": self.workspace_revision,
            "candidateSnapshotRevision": self.candidate_snapshot_revision,
            "nodeTableHash": self.node_table_hash,
            "edgeTableHash": self.edge_table_hash,
            "seedChecksum": checksum,
            "seedCount": len(normalized_seeds),
            "candidateFilterCount": len(candidate_ids),
            "alpha": float(req.alpha),
            "tol": float(req.tol),
            "maxIter": int(req.maxIter),
            "parameterManifestId": req.parameterManifestId,
            "parameterChecksum": computed_parameter_checksum,
            "didConverge": True,
            "precomputedOutWeight": True,
            "cacheHit": cache_hit,
            "nodeCount": self.node_count,
            "edgeCount": self.edge_count,
            "results": results,
            "timings": {
                "kernelMs": round(kernel_ms, 3),
                "resultSelectMs": round(result_select_ms, 3),
            },
        }

    def bfs(self, req: BFSRequest) -> dict[str, Any]:
        if self.node_count <= 0:
            raise ValueError("BFS requires at least one node")
        if req.graphRevision != self.graph_revision:
            raise LookupError(f"resident revision {self.graph_revision} != requested {req.graphRevision}")
        if req.expectedArtifactChecksum and req.expectedArtifactChecksum != self.artifact_checksum:
            raise LookupError("artifact checksum does not match resident graph")
        if req.expectedGraphOrdinalMapChecksum and req.expectedGraphOrdinalMapChecksum != self.graph_ordinal_map_checksum:
            raise LookupError("graph ordinal map checksum does not match resident graph")
        try:
            start_id = self.resolve_node_keys([req.startNodeKey], "start")[0]
        except (KeyError, ValueError) as exc:
            raise LookupError(f"unknown start nodeKey: {req.startNodeKey}") from exc
        started = time.perf_counter()
        result_df = cugraph.bfs(self.graph, start=start_id, depth_limit=int(req.depthLimit), return_predecessors=True)
        rows = result_df.to_pandas()
        results: list[dict[str, Any]] = []
        for row in rows.itertuples(index=False):
            vertex = int(row.vertex)
            distance = int(row.distance)
            if distance > int(req.depthLimit):
                continue
            predecessor = int(row.predecessor)
            identity = self.gpu_id_to_identity[vertex]
            results.append({
                "gpuNodeId": vertex,
                "nodeKey": identity["nodeKey"],
                "packetKey": identity["packetKey"],
                "distance": distance,
                "predecessorGpuNodeId": None if predecessor < 0 else predecessor,
            })
        results.sort(key=lambda item: (item["distance"], item["gpuNodeId"]))
        return {
            "schema": "atlas.graph-bfs-receipt.v1",
            "operation": "bfs",
            "backend": "cugraph.bfs",
            "algorithmRevision": "atlas.cugraph-bfs.v1",
            "graphRevision": self.graph_revision,
            "projectionRevision": self.projection_revision,
            "artifactChecksum": self.artifact_checksum,
            "graphOrdinalMapChecksum": self.graph_ordinal_map_checksum,
            "startNodeKey": req.startNodeKey,
            "depthLimit": int(req.depthLimit),
            "renumbered": self.renumbered,
            "nodeCount": self.node_count,
            "edgeCount": self.edge_count,
            "results": results,
            "writesPerformed": False,
            "canonicalAuthority": False,
            "timings": {"kernelMs": round((time.perf_counter() - started) * 1000, 3)},
        }

    def connected_components(self, req: ComponentsRequest) -> dict[str, Any]:
        if self.node_count <= 0:
            raise ValueError("connected components requires at least one node")
        if req.graphRevision != self.graph_revision:
            raise LookupError(f"resident revision {self.graph_revision} != requested {req.graphRevision}")
        if req.expectedArtifactChecksum and req.expectedArtifactChecksum != self.artifact_checksum:
            raise LookupError("artifact checksum does not match resident graph")
        if req.expectedGraphOrdinalMapChecksum and req.expectedGraphOrdinalMapChecksum != self.graph_ordinal_map_checksum:
            raise LookupError("artifact ordinal map checksum does not match resident graph")
        started = time.perf_counter()
        result_df = cugraph.connected_components(self.graph)
        rows = result_df.to_pandas()
        assignments = {
            int(row.vertex): int(row.labels)
            for row in rows.itertuples(index=False)
        }
        results = [
            {
                "gpuNodeId": vertex,
                "nodeKey": self.gpu_id_to_identity[vertex]["nodeKey"],
                "packetKey": self.gpu_id_to_identity[vertex]["packetKey"],
                "componentLabel": label,
            }
            for vertex, label in sorted(assignments.items())
        ]
        return {
            "schema": "atlas.graph-connected-components-receipt.v1",
            "operation": "connected_components",
            "backend": "cugraph.connected_components",
            "algorithmRevision": "atlas.cugraph-connected-components.v1",
            "graphRevision": self.graph_revision,
            "projectionRevision": self.projection_revision,
            "artifactChecksum": self.artifact_checksum,
            "graphOrdinalMapChecksum": self.graph_ordinal_map_checksum,
            "directed": self.directed,
            "nodeCount": self.node_count,
            "edgeCount": self.edge_count,
            "results": results,
            "writesPerformed": False,
            "canonicalAuthority": False,
            "timings": {"kernelMs": round((time.perf_counter() - started) * 1000, 3)},
        }

    def jaccard(self, req: JaccardRequest) -> dict[str, Any]:
        if not req.vertexPairs:
            raise ValueError("vertexPairs must not be empty")
        if len(req.vertexPairs) > _MAX_RESULT_NODES * 2:
            raise ValueError("vertexPairs exceeds bounded limit")
        if req.graphRevision != self.graph_revision:
            raise LookupError(f"resident revision {self.graph_revision} != requested {req.graphRevision}")
        if req.expectedArtifactChecksum and req.expectedArtifactChecksum != self.artifact_checksum:
            raise LookupError("artifact checksum does not match resident graph")
        if req.expectedGraphOrdinalMapChecksum and req.expectedGraphOrdinalMapChecksum != self.graph_ordinal_map_checksum:
            raise LookupError("artifact ordinal map checksum does not match resident graph")
        pairs = []
        seen: set[tuple[str, str]] = set()
        for left, right in req.vertexPairs:
            pair = (str(left).strip(), str(right).strip())
            if not pair[0] or not pair[1] or pair[0] == pair[1]:
                raise ValueError("vertexPairs must contain distinct non-empty node keys")
            if pair in seen:
                raise ValueError("vertexPairs must not contain duplicates")
            seen.add(pair)
            pairs.append((self.resolve_node_keys([pair[0]], "pair")[0], self.resolve_node_keys([pair[1]], "pair")[0]))
        started = time.perf_counter()
        pair_df = cudf.DataFrame({"first": [pair[0] for pair in pairs], "second": [pair[1] for pair in pairs]})
        result_df = cugraph.jaccard(self.graph, vertex_pair=pair_df)
        rows = result_df.to_pandas()
        score_column = "jaccard_coeff" if "jaccard_coeff" in rows.columns else "jaccard"
        results = []
        for row in rows.itertuples(index=False):
            first = int(getattr(row, "first"))
            second = int(getattr(row, "second"))
            results.append({
                "leftNodeKey": self.gpu_id_to_identity[first]["nodeKey"],
                "rightNodeKey": self.gpu_id_to_identity[second]["nodeKey"],
                "jaccard": float(getattr(row, score_column)),
            })
        results.sort(key=lambda item: (item["leftNodeKey"], item["rightNodeKey"]))
        return {
            "schema": "atlas.graph-jaccard-receipt.v1",
            "operation": "jaccard",
            "backend": "cugraph.jaccard",
            "algorithmRevision": "atlas.cugraph-jaccard.v1",
            "graphRevision": self.graph_revision,
            "projectionRevision": self.projection_revision,
            "artifactChecksum": self.artifact_checksum,
            "graphOrdinalMapChecksum": self.graph_ordinal_map_checksum,
            "candidatePairCount": len(results),
            "results": results,
            "renumbered": self.renumbered,
            "writesPerformed": False,
            "canonicalAuthority": False,
            "timings": {"kernelMs": round((time.perf_counter() - started) * 1000, 3)},
        }


class GraphRuntimeManager:
    def __init__(self, gpu_memory_reader: Callable[[], dict[str, Any] | None] | None = None) -> None:
        self._lock = threading.RLock()
        self._resident: ResidentGraph | None = None
        self._gpu_memory_reader = gpu_memory_reader

    def _assert_request_identity(self, req: Any) -> None:
        resident = self._resident
        if resident is None:
            _fail("GRAPH_NOT_RESIDENT", "load a revision-qualified graph projection first", 409)
        if req.graphRevision != resident.graph_revision:
            _fail("GRAPH_REVISION_MISMATCH", "request graph revision does not match resident graph", 409)
        if req.projectionRevision is not None and req.projectionRevision != resident.projection_revision:
            _fail("PROJECTION_REVISION_MISMATCH", "request projection revision does not match resident graph", 409)
        if req.projectionChecksum is not None and req.projectionChecksum != resident.projection_checksum:
            _fail("PROJECTION_CHECKSUM_MISMATCH", "request projection checksum does not match resident graph", 409)

    def capability(self) -> dict[str, Any]:
        return {
            "available": _IMPORT_ERROR is None,
            "backend": "cugraph.pagerank",
            "backendVersion": getattr(cugraph, "__version__", None) if cugraph is not None else None,
            "algorithmRevision": _ALGORITHM_REVISION,
            "maxSeeds": _MAX_SEEDS,
            "maxResultNodes": _MAX_RESULT_NODES,
            "minGraphFreeGpuMb": _MIN_GRAPH_FREE_GPU_MB,
            "importError": _IMPORT_ERROR,
        }

    def status(self) -> dict[str, Any]:
        with self._lock:
            resident = self._resident
            return {
                "schema": "atlas.graph-residency.v1",
                "capability": self.capability(),
                "resident": None
                if resident is None
                else {
                    "graphRevision": resident.graph_revision,
                    "projectionRevision": resident.projection_revision,
                    "projectionChecksum": resident.projection_checksum,
                    "nodeTableHash": resident.node_table_hash,
                    "edgeTableHash": resident.edge_table_hash,
                    "ordinalMapChecksum": resident.graph_ordinal_map_checksum,
                    "graphKind": resident.graph_kind,
                    "directed": resident.directed,
                    "symmetrizationPolicy": resident.symmetrization_policy,
                    "nodeCount": resident.node_count,
                    "edgeCount": resident.edge_count,
                    "renumbered": resident.renumbered,
                    "loadedAtUnixMs": int(resident.loaded_at * 1000),
                },
            }

    def load(self, req: GraphLoadRequest) -> dict[str, Any]:
        if _IMPORT_ERROR is not None:
            _fail("CUGRAPH_UNAVAILABLE", _IMPORT_ERROR, 503)
        root = _artifact_root()
        artifact_dir = Path(req.artifactDir).resolve()
        if not _inside_root(artifact_dir, root):
            _fail("GRAPH_ARTIFACT_OUTSIDE_ROOT", f"{artifact_dir} is outside {root}")
        manifest_path = artifact_dir / "manifest.json"
        if not manifest_path.is_file():
            _fail("GRAPH_MANIFEST_MISSING", str(manifest_path))

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        required = ["graphRevision", "projectionRevision", "nodeCount", "edgeCount", "nodeTableHash", "edgeTableHash"]
        missing = [key for key in required if key not in manifest]
        if missing:
            _fail("GRAPH_MANIFEST_INVALID", f"missing keys: {missing}")
        graph_revision = str(manifest["graphRevision"])
        projection_revision = str(manifest["projectionRevision"])
        if req.expectedGraphRevision and req.expectedGraphRevision != graph_revision:
            _fail("GRAPH_REVISION_MISMATCH", f"manifest {graph_revision} != expected {req.expectedGraphRevision}")
        if req.expectedProjectionRevision and req.expectedProjectionRevision != projection_revision:
            _fail("PROJECTION_REVISION_MISMATCH", f"manifest {projection_revision} != expected {req.expectedProjectionRevision}")
        projection_checksum = str(manifest.get("projectionChecksum") or manifest.get("artifactChecksum") or "")
        resident_artifact_identity = {
            "graphRevision": graph_revision,
            "projectionRevision": projection_revision,
            "nodeCount": manifest.get("nodeCount"),
            "edgeCount": manifest.get("edgeCount"),
            "nodeTableHash": manifest.get("nodeTableHash"),
            "edgeTableHash": manifest.get("edgeTableHash"),
        }
        artifact_checksum = str(manifest.get("artifactChecksum") or hashlib.sha256(
            json.dumps(resident_artifact_identity, separators=(",", ":"), sort_keys=True).encode("utf-8")
        ).hexdigest())
        if req.expectedArtifactChecksum and req.expectedArtifactChecksum != artifact_checksum:
            _fail("ARTIFACT_CHECKSUM_MISMATCH", f"manifest {artifact_checksum} != expected {req.expectedArtifactChecksum}")
        if not projection_checksum:
            projection_checksum = artifact_checksum
        if req.expectedProjectionChecksum and req.expectedProjectionChecksum != projection_checksum:
            _fail("PROJECTION_CHECKSUM_MISMATCH", f"manifest {projection_checksum} != expected {req.expectedProjectionChecksum}")
        ordinal_checksum = manifest.get("ordinalMapChecksum") or manifest.get("graphOrdinalMapChecksum")
        if req.expectedGraphOrdinalMapChecksum and req.expectedGraphOrdinalMapChecksum != ordinal_checksum:
            _fail("GRAPH_ORDINAL_MAP_CHECKSUM_MISMATCH", "graph ordinal map checksum does not match resident manifest")
        if req.expectedWorkspaceRevision and req.expectedWorkspaceRevision != manifest.get("workspaceRevision"):
            _fail("WORKSPACE_REVISION_MISMATCH", "workspace revision does not match resident manifest")
        if req.expectedCandidateSnapshotRevision and req.expectedCandidateSnapshotRevision != manifest.get("candidateSnapshotRevision"):
            _fail("CANDIDATE_SNAPSHOT_REVISION_MISMATCH", "candidate snapshot revision does not match resident manifest")

        with self._lock:
            if self._resident is not None and self._resident.graph_revision == graph_revision:
                resident_identity = (
                    self._resident.projection_revision,
                    self._resident.projection_checksum,
                    self._resident.node_table_hash,
                    self._resident.edge_table_hash,
                    self._resident.graph_ordinal_map_checksum,
                    self._resident.graph_kind,
                    self._resident.directed,
                    self._resident.symmetrization_policy,
                    self._resident.node_count,
                    self._resident.edge_count,
                )
                requested_identity = (
                    projection_revision,
                    projection_checksum,
                    str(manifest["nodeTableHash"]),
                    str(manifest["edgeTableHash"]),
                    ordinal_checksum,
                    str(manifest.get("graphKind") or "UNKNOWN"),
                    bool(manifest.get("directed", True)),
                    str(manifest.get("symmetrizationPolicy") or "UNSPECIFIED"),
                    int(manifest["nodeCount"]),
                    int(manifest["edgeCount"]),
                )
                if resident_identity != requested_identity:
                    _fail(
                        "PROJECTION_REVISION_CHECKSUM_CONFLICT",
                        f"projection revision {projection_revision} is resident with a different semantic identity",
                        409,
                    )
                return {**self.status(), "reused": True}
            if self._resident is not None and not req.replaceResident:
                _fail(
                    "GRAPH_REVISION_ALREADY_RESIDENT",
                    f"{self._resident.graph_revision} is resident; set replaceResident=true to swap revisions",
                    409,
                )

            memory_before = self._gpu_memory_reader() if self._gpu_memory_reader else None
            if memory_before and isinstance(memory_before.get("free_mb"), (int, float)):
                if float(memory_before["free_mb"]) < _MIN_GRAPH_FREE_GPU_MB:
                    _fail(
                        "INSUFFICIENT_GPU_MEMORY",
                        f"{memory_before['free_mb']}MB free < {_MIN_GRAPH_FREE_GPU_MB}MB graph-load floor",
                        503,
                    )

            started = time.perf_counter()
            content_equivalent = self._resident is not None and self._resident.projection_checksum == projection_checksum
            resident = ResidentGraph(artifact_dir, manifest)
            self._resident = resident
            load_ms = (time.perf_counter() - started) * 1000
            memory_after = self._gpu_memory_reader() if self._gpu_memory_reader else None
            return {
                "schema": "atlas.graph-projection-load-receipt.v1",
                "reused": False,
                "contentEquivalent": content_equivalent,
                "graphRevision": resident.graph_revision,
                "projectionRevision": resident.projection_revision,
                "projectionChecksum": resident.projection_checksum,
                "artifactChecksum": resident.artifact_checksum,
                "graphOrdinalMapChecksum": resident.graph_ordinal_map_checksum,
                "workspaceRevision": resident.workspace_revision,
                "candidateSnapshotRevision": resident.candidate_snapshot_revision,
                "nodeTableHash": resident.node_table_hash,
                "edgeTableHash": resident.edge_table_hash,
                "nodeCount": resident.node_count,
                "edgeCount": resident.edge_count,
                "renumbered": resident.renumbered,
                "storeTransposed": True,
                "precomputedOutWeight": True,
                "timings": {
                    "parquetReadMs": round(resident.parquet_read_ms, 3),
                    "graphBuildMs": round(resident.graph_build_ms, 3),
                    "outWeightBuildMs": round(resident.out_weight_build_ms, 3),
                    "totalLoadMs": round(load_ms, 3),
                },
                "gpuMemoryBefore": memory_before,
                "gpuMemoryAfter": memory_after,
            }

    def pagerank(self, req: PageRankRequest) -> dict[str, Any]:
        with self._lock:
            self._assert_request_identity(req)
            try:
                return self._resident.pagerank(req)
            except KeyError as exc:
                _fail("GRAPH_NODE_NOT_RESIDENT", str(exc))
            except LookupError as exc:
                _fail("GRAPH_REVISION_MISMATCH", str(exc), 409)
            except TimeoutError as exc:
                _fail("PAGERANK_DEADLINE_EXCEEDED", str(exc), 408)
            except ValueError as exc:
                _fail("PAGERANK_INVALID_REQUEST", str(exc))
            except Exception as exc:
                _fail("PAGERANK_EXECUTION_FAILED", f"{type(exc).__name__}: {exc}", 500)
        raise AssertionError("unreachable")

    def jaccard(self, req: JaccardRequest) -> dict[str, Any]:
        with self._lock:
            self._assert_request_identity(req)
            try:
                return self._resident.jaccard(req)
            except KeyError as exc:
                _fail("GRAPH_NODE_NOT_RESIDENT", str(exc))
            except LookupError as exc:
                _fail("GRAPH_REVISION_MISMATCH", str(exc), 409)
            except ValueError as exc:
                _fail("JACCARD_INVALID_REQUEST", str(exc))
            except Exception as exc:
                _fail("JACCARD_EXECUTION_FAILED", f"{type(exc).__name__}: {exc}", 500)
        raise AssertionError("unreachable")

    def connected_components(self, req: ComponentsRequest) -> dict[str, Any]:
        with self._lock:
            self._assert_request_identity(req)
            try:
                return self._resident.connected_components(req)
            except LookupError as exc:
                _fail("GRAPH_REVISION_MISMATCH", str(exc), 409)
            except ValueError as exc:
                _fail("COMPONENTS_INVALID_REQUEST", str(exc))
            except Exception as exc:
                _fail("COMPONENTS_EXECUTION_FAILED", f"{type(exc).__name__}: {exc}", 500)
        raise AssertionError("unreachable")

    def bfs(self, req: BFSRequest) -> dict[str, Any]:
        with self._lock:
            self._assert_request_identity(req)
            try:
                return self._resident.bfs(req)
            except KeyError as exc:
                _fail("GRAPH_NODE_NOT_RESIDENT", str(exc))
            except LookupError as exc:
                _fail("GRAPH_REVISION_MISMATCH", str(exc), 409)
            except ValueError as exc:
                _fail("BFS_INVALID_REQUEST", str(exc))
            except Exception as exc:
                _fail("BFS_EXECUTION_FAILED", f"{type(exc).__name__}: {exc}", 500)
        raise AssertionError("unreachable")


def install_graph_routes(
    app: FastAPI,
    gpu_memory_reader: Callable[[], dict[str, Any] | None] | None = None,
) -> GraphRuntimeManager:
    manager = GraphRuntimeManager(gpu_memory_reader=gpu_memory_reader)
    router = APIRouter(prefix="/v1/graph", tags=["atlas-graph"])

    @router.get("/capabilities")
    def graph_capabilities() -> dict[str, Any]:
        return manager.capability()

    @router.get("/resident")
    def graph_resident() -> dict[str, Any]:
        return manager.status()

    @router.post("/load")
    def graph_load(req: GraphLoadRequest) -> dict[str, Any]:
        return manager.load(req)

    @router.post("/pagerank")
    def graph_pagerank(req: PageRankRequest) -> dict[str, Any]:
        return manager.pagerank(req)

    @router.post("/bfs")
    def graph_bfs(req: BFSRequest) -> dict[str, Any]:
        return manager.bfs(req)

    @router.post("/connected-components")
    def graph_connected_components(req: ComponentsRequest) -> dict[str, Any]:
        return manager.connected_components(req)

    @router.post("/jaccard")
    def graph_jaccard(req: JaccardRequest) -> dict[str, Any]:
        return manager.jaccard(req)

    app.include_router(router)
    return manager
