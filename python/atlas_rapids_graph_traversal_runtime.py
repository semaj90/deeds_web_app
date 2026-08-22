"""Bounded cuGraph traversal extension for the resident Parent Atlas graph.

This module deliberately reuses the single revision-qualified ResidentGraph
owned by atlas_rapids_graph_runtime. It does not load a second graph copy or
claim graph/candidate identity authority. The first executable traversal is
outbound BFS only; inbound/both remain fail-closed until a reverse traversal is
implemented without silently doubling resident VRAM or changing semantics.
"""

from __future__ import annotations

import math
import os
import time
from typing import Any, Literal

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, Field

from atlas_rapids_graph_runtime import GraphRuntimeManager, cugraph

_ALGORITHM_REVISION = "atlas.cugraph-bfs.v1"
_MAX_HOPS = int(os.getenv("ATLAS_RAPIDS_BFS_MAX_HOPS", "4"))
_MAX_RESULT_NODES = int(os.getenv("ATLAS_RAPIDS_BFS_MAX_RESULT_NODES", "512"))


class GraphBfsRequest(BaseModel):
    graphRevision: str
    seedNodeKey: str
    candidateNodeKeys: list[str] = Field(default_factory=list)
    maxHops: int = 2
    maxNodes: int = 128
    direction: Literal["outbound", "inbound", "both"] = "outbound"
    deadlineMs: int | None = None


def validate_bfs_request(req: GraphBfsRequest) -> None:
    if not req.graphRevision.strip():
        raise ValueError("graphRevision must be non-empty")
    if not req.seedNodeKey.strip():
        raise ValueError("seedNodeKey must be non-empty")
    if req.direction != "outbound":
        raise ValueError("CUGRAPH_BFS_OUTBOUND_ONLY")
    if req.maxHops < 1 or req.maxHops > _MAX_HOPS:
        raise ValueError(f"maxHops must be in [1, {_MAX_HOPS}]")
    if req.maxNodes < 1 or req.maxNodes > _MAX_RESULT_NODES:
        raise ValueError(f"maxNodes must be in [1, {_MAX_RESULT_NODES}]")
    if len(req.candidateNodeKeys) > _MAX_RESULT_NODES:
        raise ValueError(f"candidate node count {len(req.candidateNodeKeys)} > max {_MAX_RESULT_NODES}")
    seen: set[str] = set()
    for raw in req.candidateNodeKeys:
        key = str(raw).strip()
        if not key:
            raise ValueError("candidate nodeKey must be non-empty")
        if key in seen:
            raise ValueError(f"duplicate candidate nodeKey: {key}")
        seen.add(key)
    if req.deadlineMs is not None and req.deadlineMs <= 0:
        raise TimeoutError("deadlineMs must be positive")


def _fail(code: str, message: str, status_code: int = 422) -> None:
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def run_bfs_against_resident(manager: GraphRuntimeManager, req: GraphBfsRequest) -> dict[str, Any]:
    validate_bfs_request(req)
    if cugraph is None:
        _fail("CUGRAPH_UNAVAILABLE", "cuGraph import failed", 503)

    # Hold the same residency lock used by graph revision swaps so a BFS cannot
    # cross from one frozen graph revision into another mid-kernel.
    with manager._lock:  # noqa: SLF001 - intentional extension of the runtime owner
        resident = manager._resident  # noqa: SLF001
        if resident is None:
            _fail("GRAPH_NOT_RESIDENT", "load a revision-qualified graph projection first", 409)
        if req.graphRevision != resident.graph_revision:
            _fail(
                "GRAPH_REVISION_MISMATCH",
                f"resident revision {resident.graph_revision} != requested {req.graphRevision}",
                409,
            )
        if resident.edge_count <= 0:
            _fail("BFS_GRAPH_EMPTY", "BFS requires at least one edge")

        try:
            seed_id = resident.resolve_node_keys([req.seedNodeKey], "seed")[0]
            candidate_ids = (
                resident.resolve_node_keys(req.candidateNodeKeys, "candidate")
                if req.candidateNodeKeys
                else []
            )
        except KeyError as exc:
            _fail("GRAPH_NODE_NOT_RESIDENT", str(exc))
        except ValueError as exc:
            _fail("BFS_INVALID_REQUEST", str(exc))

        started = time.perf_counter()
        try:
            frame = cugraph.bfs(
                resident.graph,
                start=seed_id,
                depth_limit=int(req.maxHops),
                return_predecessors=True,
            )
        except Exception as exc:
            _fail("BFS_EXECUTION_FAILED", f"{type(exc).__name__}: {exc}", 500)
        kernel_ms = (time.perf_counter() - started) * 1000
        if req.deadlineMs is not None and kernel_ms >= req.deadlineMs:
            _fail(
                "BFS_DEADLINE_EXCEEDED",
                f"BFS exceeded deadlineMs ({kernel_ms:.2f} >= {req.deadlineMs})",
                408,
            )

        select_started = time.perf_counter()
        selected = frame[(frame["distance"] >= 0) & (frame["distance"] <= req.maxHops)]
        if candidate_ids:
            selected = selected[selected["vertex"].isin(candidate_ids)]

        host_rows = selected[["vertex", "distance", "predecessor"]].to_pandas()
        projected: list[dict[str, Any]] = []
        for row in host_rows.itertuples(index=False):
            gpu_node_id = int(row.vertex)
            hop = int(row.distance)
            if hop < 0 or hop > req.maxHops:
                continue
            identity = resident.gpu_id_to_identity.get(gpu_node_id)
            if identity is None:
                raise RuntimeError(f"missing identity for gpu node {gpu_node_id}")

            predecessor_gpu: int | None = None
            predecessor_node_key: str | None = None
            try:
                raw_predecessor = int(row.predecessor)
            except (TypeError, ValueError, OverflowError):
                raw_predecessor = -1
            if raw_predecessor >= 0 and raw_predecessor != gpu_node_id:
                predecessor_identity = resident.gpu_id_to_identity.get(raw_predecessor)
                if predecessor_identity is not None:
                    predecessor_gpu = raw_predecessor
                    predecessor_node_key = str(predecessor_identity["nodeKey"])

            projected.append(
                {
                    "gpuNodeId": gpu_node_id,
                    "nodeKey": str(identity["nodeKey"]),
                    "packetKey": identity["packetKey"],
                    "hop": hop,
                    "predecessorGpuNodeId": predecessor_gpu,
                    "predecessorNodeKey": predecessor_node_key,
                }
            )

        # Canonical graph node key is the deterministic tie-break, never the
        # executor-local dense gpuNodeId.
        projected.sort(key=lambda item: (item["hop"], item["nodeKey"]))
        truncated = len(projected) > req.maxNodes
        projected = projected[: req.maxNodes]
        for rank, item in enumerate(projected, start=1):
            item["rank"] = rank
            item["proximity"] = 1.0 / (1.0 + float(item["hop"]))
            if not math.isfinite(item["proximity"]):
                raise RuntimeError("non-finite BFS proximity")

        result_select_ms = (time.perf_counter() - select_started) * 1000
        return {
            "schema": "atlas.graph-bfs-receipt.v1",
            "operation": "bfs",
            "backend": "cugraph.bfs",
            "algorithmRevision": _ALGORITHM_REVISION,
            "graphRevision": resident.graph_revision,
            "projectionRevision": resident.projection_revision,
            "nodeTableHash": resident.node_table_hash,
            "edgeTableHash": resident.edge_table_hash,
            "seedNodeKey": req.seedNodeKey,
            "seedGpuNodeId": seed_id,
            "direction": req.direction,
            "maxHops": req.maxHops,
            "maxNodes": req.maxNodes,
            "candidateFilterCount": len(candidate_ids),
            "nodeCount": resident.node_count,
            "edgeCount": resident.edge_count,
            "truncated": truncated,
            "results": projected,
            "timings": {
                "kernelMs": round(kernel_ms, 3),
                "resultSelectMs": round(result_select_ms, 3),
            },
        }


def install_graph_traversal_routes(app: FastAPI, manager: GraphRuntimeManager) -> None:
    router = APIRouter(prefix="/v1/graph", tags=["atlas-graph-traversal"])

    @router.get("/bfs/capabilities")
    def bfs_capabilities() -> dict[str, Any]:
        return {
            "available": cugraph is not None,
            "backend": "cugraph.bfs",
            "algorithmRevision": _ALGORITHM_REVISION,
            "directions": ["outbound"],
            "reverseTraversalProven": False,
            "edgeTypeFilteringProven": False,
            "maxHops": _MAX_HOPS,
            "maxResultNodes": _MAX_RESULT_NODES,
        }

    @router.post("/bfs")
    def graph_bfs(req: GraphBfsRequest) -> dict[str, Any]:
        try:
            return run_bfs_against_resident(manager, req)
        except HTTPException:
            raise
        except TimeoutError as exc:
            _fail("BFS_DEADLINE_EXCEEDED", str(exc), 408)
        except ValueError as exc:
            _fail("BFS_INVALID_REQUEST", str(exc))
        except Exception as exc:
            _fail("BFS_EXECUTION_FAILED", f"{type(exc).__name__}: {exc}", 500)
        raise AssertionError("unreachable")

    app.include_router(router)
