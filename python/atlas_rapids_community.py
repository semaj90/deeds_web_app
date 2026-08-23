"""RAPIDS community partition challenger for Parent Atlas.

This module is deliberately separate from canonical graph-analysis ownership.
Neo4j GDS remains the durable owner for promoted Louvain/Leiden runs today.
This module provides a GPU challenger using RAPIDS cuGraph 26.06 APIs so the
same frozen undirected weighted projection can be compared backend-to-backend.

Important invariants:
- The request must explicitly declare undirected weighted projection semantics.
  We never silently reinterpret a directed CALLS/IMPORTS graph as undirected.
- External node identity is preserved independently from cuGraph's internal
  integer ordinals.
- cuGraph partition ids are never treated as stable community identity.
  Community fingerprints are derived from sorted canonical member ids.
- No semantic_768 vectors are consumed here. Community detection is structural;
  semantic embeddings can label/summarize a resulting partition later.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import time
from collections import defaultdict
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


CUGRAPH_LOUVAIN_26_06 = "cugraph.louvain.26.06"
CUGRAPH_LEIDEN_26_06 = "cugraph.leiden.26.06"
CUGRAPH_SPECTRAL_MODULARITY_26_06 = "cugraph.spectralModularityMaximizationClustering.26.06"
UNDIRECTED_WEIGHTED_PROJECTION_V1 = "atlas.undirected-weighted-projection.v1"


class CommunityNodeV1(BaseModel):
    nodeId: str = Field(min_length=1)


class CommunityEdgeV1(BaseModel):
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    weight: float = Field(default=1.0, gt=0.0)


class CommunityPartitionRequestV1(BaseModel):
    schema: Literal["atlas.community-partition-request.v1"] = "atlas.community-partition-request.v1"
    algorithm: Literal["louvain", "leiden", "spectral"]
    graphRevision: str = Field(min_length=1)
    topologyHash: str = Field(min_length=1)
    projectionRevision: str = Field(min_length=1)
    projectionSemantics: Literal["atlas.undirected-weighted-projection.v1"]
    nodes: list[CommunityNodeV1] = Field(min_length=1)
    edges: list[CommunityEdgeV1]
    resolution: float = Field(default=1.0, gt=0.0)
    maxIterations: int = Field(default=100, ge=1, le=500)
    threshold: float = Field(default=1e-7, gt=0.0)
    randomState: int = 0
    theta: float = Field(default=1.0, gt=0.0)
    numClusters: int = Field(default=2, ge=1, le=32)
    numEigenvectors: int = Field(default=2, ge=1, le=32)
    eigenTolerance: float = Field(default=1e-5, gt=0.0)
    eigenMaxIterations: int = Field(default=100, ge=1, le=1000)
    kmeansTolerance: float = Field(default=1e-5, gt=0.0)
    kmeansMaxIterations: int = Field(default=100, ge=1, le=1000)

    @model_validator(mode="after")
    def validate_identity_and_edges(self) -> "CommunityPartitionRequestV1":
        node_ids = [node.nodeId for node in self.nodes]
        if len(set(node_ids)) != len(node_ids):
            raise ValueError("nodes must have unique nodeId values")
        if self.algorithm == "spectral":
            if self.numEigenvectors > self.numClusters:
                raise ValueError("spectral numEigenvectors must be <= numClusters")
            if self.numClusters > len(node_ids):
                raise ValueError("spectral numClusters must be <= node count")
        known = set(node_ids)
        for edge in self.edges:
            if edge.source not in known or edge.target not in known:
                raise ValueError(f"edge references unknown node: {edge.source}->{edge.target}")
            if edge.source == edge.target:
                raise ValueError("self edges are not accepted by the community challenger contract")
        return self


class CommunityAssignmentV1(BaseModel):
    nodeId: str
    communityOrdinal: int = Field(ge=0)
    communityFingerprint: str


class CommunityPartitionV1(BaseModel):
    communityOrdinal: int = Field(ge=0)
    communityFingerprint: str
    memberNodeIds: list[str] = Field(min_length=1)


class CommunityPartitionResponseV1(BaseModel):
    schema: Literal["atlas.community-partition-response.v1"] = "atlas.community-partition-response.v1"
    algorithm: Literal["louvain", "leiden", "spectral"]
    algorithmId: str
    backend: Literal["cugraph"] = "cugraph"
    backendVersion: str
    graphRevision: str
    topologyHash: str
    projectionRevision: str
    projectionSemantics: Literal["atlas.undirected-weighted-projection.v1"]
    parameters: dict[str, Any]
    modularity: float | None
    qualityMetric: str
    assignments: list[CommunityAssignmentV1]
    communities: list[CommunityPartitionV1]
    inputHash: str
    outputHash: str
    durationMs: float
    executionReceipt: dict[str, Any] | None = None


def _sha256_json(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _execution_receipt(
    *,
    graph_input_hash: str,
    assignment_checksum: str,
    duration_ms: float,
    torch: Any,
    cugraph: Any,
) -> dict[str, Any]:
    """Collect observational runtime evidence; never authorize a promotion."""
    driver_version: str | None = None
    try:
        completed = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            check=False,
            timeout=2,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            driver_version = completed.stdout.strip().splitlines()[0]
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        pass

    gpu_memory: dict[str, Any] | None = None
    try:
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        gpu_memory = {"freeBytes": int(free_bytes), "totalBytes": int(total_bytes)}
    except Exception:
        gpu_memory = None

    return {
        "schema": "atlas.community-execution-receipt.v1",
        "graphInputHash": graph_input_hash,
        "assignmentChecksum": assignment_checksum,
        "durationMs": duration_ms,
        "gpu": {
            "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "cudaAvailable": bool(torch.cuda.is_available()),
            "torchVersion": str(getattr(torch, "__version__", "unknown")),
            "torchCudaRuntime": str(getattr(torch.version, "cuda", None)),
            "driverVersion": driver_version,
            "memory": gpu_memory,
        },
        "rapids": {"cugraphVersion": str(getattr(cugraph, "__version__", "unknown"))},
        "canonicalWritesAllowed": False,
        "promotionEligible": False,
    }


def canonicalize_undirected_edges(
    nodes: list[CommunityNodeV1],
    edges: list[CommunityEdgeV1],
) -> tuple[list[str], list[tuple[int, int, float]]]:
    """Return stable node ids and one weighted row per unordered edge pair."""
    node_ids = sorted(node.nodeId for node in nodes)
    ordinal_by_id = {node_id: ordinal for ordinal, node_id in enumerate(node_ids)}
    weights: dict[tuple[int, int], float] = defaultdict(float)

    for edge in edges:
        left = ordinal_by_id[edge.source]
        right = ordinal_by_id[edge.target]
        a, b = (left, right) if left < right else (right, left)
        weights[(a, b)] += float(edge.weight)

    canonical = [(a, b, weights[(a, b)]) for a, b in sorted(weights)]
    return node_ids, canonical


def canonicalize_partitions(
    node_ids: list[str],
    partition_by_ordinal: dict[int, int],
) -> tuple[list[CommunityAssignmentV1], list[CommunityPartitionV1]]:
    """Canonicalize backend partition ids into stable membership fingerprints."""
    groups: dict[int, list[str]] = defaultdict(list)
    for ordinal, node_id in enumerate(node_ids):
        backend_partition = partition_by_ordinal.get(ordinal)
        if backend_partition is None:
            raise ValueError(f"backend omitted partition for node ordinal {ordinal} ({node_id})")
        groups[int(backend_partition)].append(node_id)

    canonical_groups: list[tuple[str, list[str]]] = []
    for members in groups.values():
        sorted_members = sorted(members)
        fingerprint = _sha256_json({"memberNodeIds": sorted_members})
        canonical_groups.append((fingerprint, sorted_members))
    canonical_groups.sort(key=lambda item: item[0])

    community_ordinal_by_node: dict[str, tuple[int, str]] = {}
    communities: list[CommunityPartitionV1] = []
    for community_ordinal, (fingerprint, members) in enumerate(canonical_groups):
        communities.append(
            CommunityPartitionV1(
                communityOrdinal=community_ordinal,
                communityFingerprint=fingerprint,
                memberNodeIds=members,
            )
        )
        for node_id in members:
            community_ordinal_by_node[node_id] = (community_ordinal, fingerprint)

    assignments = [
        CommunityAssignmentV1(
            nodeId=node_id,
            communityOrdinal=community_ordinal_by_node[node_id][0],
            communityFingerprint=community_ordinal_by_node[node_id][1],
        )
        for node_id in node_ids
    ]
    return assignments, communities


def run_cugraph_partition(req: CommunityPartitionRequestV1) -> CommunityPartitionResponseV1:
    """Execute Louvain or Leiden against the request's explicit undirected projection."""
    started = time.perf_counter()
    try:
        # Load PyTorch first so its CUDA runtime symbols are resolved before
        # RAPIDS loads its cuBLAS/cuGraph extensions in shared processes.
        import torch  # noqa: F401
        import cudf
        import cugraph
    except Exception as exc:  # pragma: no cover - runtime capability boundary
        raise RuntimeError(f"cuGraph unavailable: {type(exc).__name__}: {exc}") from exc

    node_ids, canonical_edges = canonicalize_undirected_edges(req.nodes, req.edges)
    # Keep every ordinal column at one width.  cuGraph's spectral modularity
    # implementation requires int32 vertices; allowing DataFrame inference to
    # widen only the edge columns causes invalid device-side graph copies.
    ordinal_dtype = "int32"
    vertices = cudf.Series(list(range(len(node_ids))), dtype=ordinal_dtype)

    if canonical_edges:
        edge_df = cudf.DataFrame(
            {
                "src": cudf.Series([edge[0] for edge in canonical_edges], dtype=ordinal_dtype),
                "dst": cudf.Series([edge[1] for edge in canonical_edges], dtype=ordinal_dtype),
                "weight": [edge[2] for edge in canonical_edges],
            }
        )
    else:
        edge_df = cudf.DataFrame(
            {
                "src": cudf.Series([], dtype=ordinal_dtype),
                "dst": cudf.Series([], dtype=ordinal_dtype),
                "weight": cudf.Series([], dtype="float32"),
            }
        )

    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(
        edge_df,
        source="src",
        destination="dst",
        edge_attr="weight",
        renumber=False,
        vertices=vertices,
    )

    if req.algorithm == "spectral":
        spectral = getattr(cugraph, "spectralModularityMaximizationClustering", None)
        if spectral is None:
            raise RuntimeError("cuGraph spectral modularity clustering is unavailable")
        parts = spectral(
            graph,
            num_clusters=req.numClusters,
            num_eigen_vects=req.numEigenvectors,
            evs_tolerance=req.eigenTolerance,
            evs_max_iter=req.eigenMaxIterations,
            kmean_tolerance=req.kmeansTolerance,
            kmean_max_iter=req.kmeansMaxIterations,
            random_state=req.randomState,
        )
        modularity = None
        algorithm_id = CUGRAPH_SPECTRAL_MODULARITY_26_06
        quality_metric = "MODULARITY_MAXIMIZATION"
        parameters: dict[str, Any] = {
            "num_clusters": req.numClusters,
            "num_eigen_vects": req.numEigenvectors,
            "evs_tolerance": req.eigenTolerance,
            "evs_max_iter": req.eigenMaxIterations,
            "kmean_tolerance": req.kmeansTolerance,
            "kmean_max_iter": req.kmeansMaxIterations,
            "random_state": req.randomState,
        }
        host_parts = parts[["vertex", "cluster"]].to_pandas().rename(columns={"cluster": "partition"})
    elif req.algorithm == "leiden":
        parts, modularity = cugraph.leiden(
            graph,
            max_iter=req.maxIterations,
            resolution=req.resolution,
            random_state=req.randomState,
            theta=req.theta,
        )
        algorithm_id = CUGRAPH_LEIDEN_26_06
        parameters: dict[str, Any] = {
            "max_iter": req.maxIterations,
            "resolution": req.resolution,
            "random_state": req.randomState,
            "theta": req.theta,
        }
        quality_metric = "MODULARITY"
        host_parts = parts[["vertex", "partition"]].to_pandas()
    else:
        parts, modularity = cugraph.louvain(
            graph,
            max_level=req.maxIterations,
            resolution=req.resolution,
            threshold=req.threshold,
        )
        algorithm_id = CUGRAPH_LOUVAIN_26_06
        parameters = {
            "max_level": req.maxIterations,
            "resolution": req.resolution,
            "threshold": req.threshold,
        }
        quality_metric = "MODULARITY"
        host_parts = parts[["vertex", "partition"]].to_pandas()

    partition_by_ordinal = {
        int(row.vertex): int(row.partition)
        for row in host_parts.itertuples(index=False)
    }
    assignments, communities = canonicalize_partitions(node_ids, partition_by_ordinal)

    canonical_input = {
        "algorithm": req.algorithm,
        "graphRevision": req.graphRevision,
        "topologyHash": req.topologyHash,
        "projectionRevision": req.projectionRevision,
        "projectionSemantics": req.projectionSemantics,
        "parameters": parameters,
        "nodes": node_ids,
        "edges": canonical_edges,
    }
    canonical_output = {
        "assignments": [assignment.model_dump() for assignment in assignments],
        "communities": [community.model_dump() for community in communities],
        "modularity": float(modularity) if modularity is not None else None,
        "qualityMetric": quality_metric,
    }
    duration_ms = round((time.perf_counter() - started) * 1000.0, 3)
    assignment_checksum = _sha256_json(canonical_output["assignments"])

    return CommunityPartitionResponseV1(
        algorithm=req.algorithm,
        algorithmId=algorithm_id,
        backendVersion=str(getattr(cugraph, "__version__", "unknown")),
        graphRevision=req.graphRevision,
        topologyHash=req.topologyHash,
        projectionRevision=req.projectionRevision,
        projectionSemantics=req.projectionSemantics,
        parameters=parameters,
        modularity=float(modularity) if modularity is not None else None,
        qualityMetric=quality_metric,
        assignments=assignments,
        communities=communities,
        inputHash=_sha256_json(canonical_input),
        outputHash=_sha256_json(canonical_output),
        durationMs=duration_ms,
        executionReceipt=_execution_receipt(
            graph_input_hash=_sha256_json(canonical_input),
            assignment_checksum=assignment_checksum,
            duration_ms=duration_ms,
            torch=torch,
            cugraph=cugraph,
        ),
    )
