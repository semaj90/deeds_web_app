"""Read-only graph/tensor benchmark metrics for CPU or optional torch CUDA.
No invented graph revisions, no cache writes, no automatic promotion.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass
from time import perf_counter
from typing import Mapping, Sequence
import hashlib
import json

@dataclass(frozen=True)
class MetricReceipt:
    schema: str
    backend: str
    graph_revision: str
    node_count: int
    edge_count: int
    feature_dimensions: int
    elapsed_ms: float
    max_absolute_error: float
    relative_l2_error: float
    topk_overlap: float
    checksum: str
    verified: bool

def compare_tensors(reference: Sequence[float], actual: Sequence[float], *, k: int = 10) -> dict[str, float]:
    import numpy as np
    a = np.asarray(reference, dtype=np.float64).reshape(-1)
    b = np.asarray(actual, dtype=np.float64).reshape(-1)
    if a.shape != b.shape or not a.size or not np.isfinite(a).all() or not np.isfinite(b).all():
        raise ValueError("GRAPH_TENSOR_INVALID_PAIR")
    if k < 1:
        raise ValueError("GRAPH_TOPK_INVALID")
    indices_a = np.lexsort((np.arange(a.size), -a))[:min(k, a.size)]
    indices_b = np.lexsort((np.arange(b.size), -b))[:min(k, b.size)]
    return {
        "max_absolute_error": float(np.max(np.abs(a-b))),
        "relative_l2_error": float(np.linalg.norm(a-b) / max(np.linalg.norm(a), 1e-12)),
        "topk_overlap": len(set(indices_a.tolist()) & set(indices_b.tolist())) / len(indices_a),
    }

def benchmark_dense_aggregation(node_features, edge_pairs, *, graph_revision: str, device: str = "cpu") -> MetricReceipt:
    """Mean incoming-neighbor aggregation. Torch scatter_add CPU/CUDA parity probe.

    Edge pairs: (source_ordinal, destination_ordinal), directed. CPU reference always
    runs. The CUDA device must be explicitly requested and available, without fallback.
    """
    import numpy as np
    import torch
    x = np.asarray(node_features, dtype=np.float32)
    edges = np.asarray(edge_pairs, dtype=np.int64).reshape(-1, 2)
    if x.ndim != 2 or x.shape[0] < 1 or x.shape[1] < 1 or not np.isfinite(x).all():
        raise ValueError("GRAPH_FEATURES_INVALID")
    if any(not graph_revision.strip() for _ in [0]):
        raise ValueError("GRAPH_REVISION_REQUIRED")
    if edges.size and (edges.min() < 0 or edges.max() >= x.shape[0]):
        raise ValueError("GRAPH_EDGE_OUT_OF_RANGE")
    if device not in ("cpu", "cuda"):
        raise ValueError("GRAPH_BACKEND_UNSUPPORTED")
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("GRAPH_CUDA_UNAVAILABLE_NO_FALLBACK")
    def run(target):
        tensor = torch.as_tensor(x, device=target)
        sums = torch.zeros_like(tensor)
        counts = torch.zeros((x.shape[0],1),dtype=tensor.dtype,device=target)
        if edges.size:
            src=torch.as_tensor(edges[:,0].copy(),device=target)
            dst=torch.as_tensor(edges[:,1].copy(),device=target)
            sums.index_add_(0,dst,tensor[src])
            counts.index_add_(0,dst,torch.ones((len(edges),1),device=target))
        result=torch.where(counts>0,sums / counts.clamp(min=1),tensor)
        if target=="cuda":
            torch.cuda.synchronize()
        return result.detach().cpu().numpy()
    oracle = run("cpu")
    start=perf_counter()
    observed=run(device)
    elapsed=(perf_counter()-start)*1000
    metrics=compare_tensors(oracle,observed,k=min(10,oracle.size))
    digest=hashlib.sha256(observed.tobytes()).hexdigest()
    return MetricReceipt("atlas.graph-tensor-metrics.v1",device,graph_revision,
        int(x.shape[0]),int(len(edges)),int(x.shape[1]),elapsed,
        metrics["max_absolute_error"],metrics["relative_l2_error"],
        metrics["topk_overlap"],digest,bool(np.allclose(oracle,observed,rtol=1e-5,atol=1e-6)))
