"""Deterministic NetworkX-oracle to cuGraph PageRank comparison helpers."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from typing import Mapping

from .contracts import GraphExecutionReceiptV2
from .rank_metrics import compare_ranked_scores


@dataclass(frozen=True)
class GraphCpuGpuParityReceiptV1:
    schema: str
    graph_revision: str
    graph_ordinal_map_checksum: str
    input_checksum: str
    networkx_output_checksum: str
    cugraph_output_checksum: str
    vertex_count: int
    top_k: int
    tolerance: float
    max_absolute_delta: float
    top_k_overlap: int
    status: str
    canonical_authority: bool = False
    writes_performed: bool = False


def pagerank_scores_checksum(scores: Mapping[int, float]) -> str:
    """Checksum a score map in ordinal order, independent of map insertion order."""
    rows: list[list[object]] = []
    for ordinal, score in scores.items():
        if isinstance(ordinal, bool) or not isinstance(ordinal, int):
            raise ValueError("PAGERANK_ORDINAL_INVALID")
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            raise ValueError("PAGERANK_SCORE_INVALID")
        value = float(score)
        if not math.isfinite(value) or value < 0.0:
            raise ValueError("PAGERANK_SCORE_NONFINITE_OR_NEGATIVE")
        rows.append([ordinal, value.hex()])
    if len({row[0] for row in rows}) != len(rows):
        raise ValueError("PAGERANK_ORDINAL_DUPLICATE")
    payload = json.dumps(sorted(rows), separators=(",", ":"), ensure_ascii=True)
    return "sha256:" + hashlib.sha256(payload.encode("ascii")).hexdigest()


def compare_pagerank_v2(
    *,
    networkx_receipt: GraphExecutionReceiptV2,
    cugraph_receipt: GraphExecutionReceiptV2,
    networkx_scores: Mapping[int, float],
    cugraph_scores: Mapping[int, float],
    graph_ordinal_map_checksum: str,
    top_k: int = 20,
    tolerance: float = 1e-5,
) -> GraphCpuGpuParityReceiptV1:
    """Compare two proven V2 PageRank outputs bound to the same graph input."""
    if (
        len(graph_ordinal_map_checksum) != 71
        or not graph_ordinal_map_checksum.startswith("sha256:")
        or any(char not in "0123456789abcdef" for char in graph_ordinal_map_checksum[7:])
    ):
        raise ValueError("GRAPH_ORDINAL_MAP_CHECKSUM_REQUIRED")
    if isinstance(top_k, bool) or not isinstance(top_k, int) or top_k < 1:
        raise ValueError("PAGERANK_PARITY_TOP_K_INVALID")
    if not math.isfinite(tolerance) or tolerance < 0.0:
        raise ValueError("PAGERANK_PARITY_TOLERANCE_INVALID")

    if networkx_receipt.effective_backend != "networkx":
        raise ValueError("PAGERANK_PARITY_NETWORKX_RECEIPT_REQUIRED")
    if cugraph_receipt.effective_backend != "cugraph":
        raise ValueError("PAGERANK_PARITY_CUGRAPH_RECEIPT_REQUIRED")
    if any(
        receipt.operation != "GRAPH_PAGERANK"
        or receipt.status != "PROVEN"
        or receipt.canonical_authority
        or receipt.writes_performed
        for receipt in (networkx_receipt, cugraph_receipt)
    ):
        raise ValueError("PAGERANK_PARITY_RECEIPT_NOT_ADMISSIBLE")
    if (
        networkx_receipt.graph_revision != cugraph_receipt.graph_revision
        or networkx_receipt.input_checksum != cugraph_receipt.input_checksum
        or networkx_receipt.node_count != cugraph_receipt.node_count
        or networkx_receipt.edge_count != cugraph_receipt.edge_count
    ):
        raise ValueError("PAGERANK_PARITY_INPUT_MISMATCH")

    if set(networkx_scores) != set(cugraph_scores):
        raise ValueError("PAGERANK_PARITY_ORDINAL_SET_MISMATCH")
    if len(networkx_scores) != networkx_receipt.node_count:
        raise ValueError("PAGERANK_PARITY_VERTEX_COUNT_MISMATCH")

    nx_checksum = pagerank_scores_checksum(networkx_scores)
    cg_checksum = pagerank_scores_checksum(cugraph_scores)
    if nx_checksum != networkx_receipt.output_checksum:
        raise ValueError("PAGERANK_PARITY_NETWORKX_OUTPUT_CHECKSUM_MISMATCH")
    if cg_checksum != cugraph_receipt.output_checksum:
        raise ValueError("PAGERANK_PARITY_CUGRAPH_OUTPUT_CHECKSUM_MISMATCH")

    ordinals = sorted(networkx_scores)
    max_delta = max(
        (abs(float(networkx_scores[o]) - float(cugraph_scores[o])) for o in ordinals),
        default=0.0,
    )
    k = min(top_k, len(ordinals))
    nx_top = sorted(ordinals, key=lambda ordinal: (-float(networkx_scores[ordinal]), ordinal))[:k]
    cg_top = sorted(ordinals, key=lambda ordinal: (-float(cugraph_scores[ordinal]), ordinal))[:k]
    overlap = len(set(nx_top) & set(cg_top))

    return GraphCpuGpuParityReceiptV1(
        schema="atlas.graph-cpu-gpu-parity-receipt.v1",
        graph_revision=networkx_receipt.graph_revision,
        graph_ordinal_map_checksum=graph_ordinal_map_checksum,
        input_checksum=networkx_receipt.input_checksum,
        networkx_output_checksum=nx_checksum,
        cugraph_output_checksum=cg_checksum,
        vertex_count=len(ordinals),
        top_k=k,
        tolerance=tolerance,
        max_absolute_delta=max_delta,
        top_k_overlap=overlap,
        status=(
            "PARITY_PROVEN"
            if max_delta <= tolerance and overlap == k
            else "PARITY_DIVERGED"
        ),
    )


def compare_pagerank_metrics_v1(
    *,
    networkx_receipt: GraphExecutionReceiptV2,
    cugraph_receipt: GraphExecutionReceiptV2,
    networkx_scores: Mapping[int, float],
    cugraph_scores: Mapping[int, float],
    graph_ordinal_map_checksum: str,
    dangling_ordinals: tuple[int, ...] = (),
    dangling_policy: str = "UNIFORM",
    tolerance: float = 1e-5,
) -> dict[str, object]:
    """Return strict graph identity plus detailed global-PageRank metrics."""
    parity = compare_pagerank_v2(
        networkx_receipt=networkx_receipt,
        cugraph_receipt=cugraph_receipt,
        networkx_scores=networkx_scores,
        cugraph_scores=cugraph_scores,
        graph_ordinal_map_checksum=graph_ordinal_map_checksum,
        top_k=1,
        tolerance=tolerance,
    )
    if dangling_policy not in {"UNIFORM", "PERSONALIZATION", "EXPLICIT"}:
        raise ValueError("PAGERANK_DANGLING_POLICY_INVALID")
    dangling = set(dangling_ordinals)
    if not dangling.issubset(networkx_scores):
        raise ValueError("PAGERANK_DANGLING_ORDINAL_UNKNOWN")
    metrics = compare_ranked_scores(networkx_scores, cugraph_scores)
    metrics["danglingPolicy"] = dangling_policy
    metrics["danglingOrdinals"] = sorted(dangling)
    metrics["danglingScoreMassNetworkX"] = math.fsum(float(networkx_scores[o]) for o in dangling)
    metrics["danglingScoreMassCuGraph"] = math.fsum(float(cugraph_scores[o]) for o in dangling)
    metrics["danglingScoreMassAbsoluteDelta"] = abs(
        float(metrics["danglingScoreMassNetworkX"]) - float(metrics["danglingScoreMassCuGraph"])
    )
    metrics["parityStatus"] = parity.status
    return metrics
