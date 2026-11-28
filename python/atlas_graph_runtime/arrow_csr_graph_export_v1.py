"""Arrow IPC Compressed Sparse Row (CSR) Graph Export & Checksum Contract (v1).

Stores bulk graph topology numerics (`indptr`, `indices`, `weights`) in Apache
Arrow IPC streams rather than GPJSON, bound to a deterministic node ordinal map
and SHA-256 checksums. Strictly read-only (`canonical_authority=False`).
"""
from __future__ import annotations

import hashlib
import io
import json
from dataclasses import dataclass
from typing import Any, Mapping, Sequence, Tuple

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc


@dataclass(frozen=True)
class ArrowCsrGraphBundleV1:
    schema: str
    graph_revision: str
    node_count: int
    edge_count: int
    ordinal_map_checksum: str
    csr_ipc_checksum: str
    node_keys: tuple[str, ...]
    indptr_ipc_bytes: bytes
    edges_ipc_bytes: bytes
    canonical_authority: bool = False
    writes_performed: bool = False


def _sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _sha256_json(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return _sha256_bytes(payload)


def _table_to_ipc_stream(table: pa.Table) -> bytes:
    sink = io.BytesIO()
    with ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue()


def _ipc_stream_to_table(raw: bytes) -> pa.Table:
    with ipc.open_stream(io.BytesIO(raw)) as reader:
        return reader.read_all()


def export_graph_to_arrow_csr_v1(
    node_keys: Sequence[str],
    edges: Sequence[Tuple[str, str, float]],
    *,
    graph_revision: str,
) -> ArrowCsrGraphBundleV1:
    """Convert a node/edge list into deterministic CSR Arrow IPC streams with SHA-256 checksums."""
    if not graph_revision.strip():
        raise ValueError("GRAPH_REVISION_REQUIRED")

    ordered_nodes = sorted({str(n) for n in node_keys})
    key_to_ord = {k: i for i, k in enumerate(ordered_nodes)}
    n = len(ordered_nodes)

    adj: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    for src, dst, w in edges:
        s_key, d_key = str(src), str(dst)
        if s_key not in key_to_ord or d_key not in key_to_ord:
            raise ValueError(f"EDGE_NODE_NOT_IN_ORDINAL_MAP: {s_key} -> {d_key}")
        weight = float(w)
        if not np.isfinite(weight):
            raise ValueError("NON_FINITE_EDGE_WEIGHT")
        adj[key_to_ord[s_key]].append((key_to_ord[d_key], weight))

    indptr = np.zeros(n + 1, dtype=np.uint32)
    flat_indices: list[int] = []
    flat_weights: list[float] = []
    for u in range(n):
        neighbors = sorted(adj[u], key=lambda pair: pair[0])
        indptr[u + 1] = indptr[u] + len(neighbors)
        for v, w in neighbors:
            flat_indices.append(v)
            flat_weights.append(w)

    indices_arr = np.asarray(flat_indices, dtype=np.uint32)
    weights_arr = np.asarray(flat_weights, dtype=np.float32)

    ordinal_map_checksum = _sha256_json([[i, k] for i, k in enumerate(ordered_nodes)])
    indptr_table = pa.table(
        {"indptr": pa.array(indptr, type=pa.uint32())},
        metadata={
            b"schema": b"atlas.arrow-csr-indptr.v1",
            b"graph_revision": graph_revision.encode("utf-8"),
            b"ordinal_map_checksum": ordinal_map_checksum.encode("utf-8"),
        },
    )
    edges_table = pa.table(
        {
            "indices": pa.array(indices_arr, type=pa.uint32()),
            "weights": pa.array(weights_arr, type=pa.float32()),
        },
        metadata={
            b"schema": b"atlas.arrow-csr-edges.v1",
            b"graph_revision": graph_revision.encode("utf-8"),
            b"ordinal_map_checksum": ordinal_map_checksum.encode("utf-8"),
        },
    )

    indptr_ipc = _table_to_ipc_stream(indptr_table)
    edges_ipc = _table_to_ipc_stream(edges_table)
    csr_ipc_checksum = _sha256_bytes(indptr_ipc + edges_ipc)

    return ArrowCsrGraphBundleV1(
        schema="atlas.arrow-csr-graph.v1",
        graph_revision=graph_revision,
        node_count=n,
        edge_count=len(flat_indices),
        ordinal_map_checksum=ordinal_map_checksum,
        csr_ipc_checksum=csr_ipc_checksum,
        node_keys=tuple(ordered_nodes),
        indptr_ipc_bytes=indptr_ipc,
        edges_ipc_bytes=edges_ipc,
        canonical_authority=False,
        writes_performed=False,
    )


def roundtrip_verify_arrow_csr_v1(bundle: ArrowCsrGraphBundleV1) -> dict[str, Any]:
    """Decode Arrow IPC CSR buffers and verify checksum and structural invariants."""
    recomputed_csr_sum = _sha256_bytes(bundle.indptr_ipc_bytes + bundle.edges_ipc_bytes)
    if recomputed_csr_sum != bundle.csr_ipc_checksum:
        raise ValueError("CSR_IPC_CHECKSUM_MISMATCH")

    indptr_tbl = _ipc_stream_to_table(bundle.indptr_ipc_bytes)
    edges_tbl = _ipc_stream_to_table(bundle.edges_ipc_bytes)
    indptr = indptr_tbl["indptr"].to_numpy()
    indices = edges_tbl["indices"].to_numpy()
    weights = edges_tbl["weights"].to_numpy()

    if len(indptr) != bundle.node_count + 1:
        raise ValueError("CSR_INDPTR_LENGTH_MISMATCH")
    if int(indptr[-1]) != len(indices) or len(indices) != bundle.edge_count:
        raise ValueError("CSR_EDGE_COUNT_MISMATCH")
    if not np.isfinite(weights).all():
        raise ValueError("CSR_NON_FINITE_WEIGHTS")

    return {
        "schema": "atlas.arrow-csr-verify.v1",
        "graph_revision": bundle.graph_revision,
        "node_count": bundle.node_count,
        "edge_count": bundle.edge_count,
        "ordinal_map_checksum": bundle.ordinal_map_checksum,
        "csr_ipc_checksum": bundle.csr_ipc_checksum,
        "verified": True,
        "canonical_authority": False,
        "writes_performed": False,
    }
