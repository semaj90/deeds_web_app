#!/usr/bin/env python3
"""
P16 Proof: GRAPH-CSR-01 & CUGRAPH-PARITY-01
Compiles the admitted typed code-edge graph from `p13-p17-stratified-feature-cohort-receipt-v1.json`
into a validated Compressed Sparse Row (CSR) structure (`indptr`, `indices`, `weights`),
executes:
  1. CPU NetworkX PageRank (`nx.pagerank`)
  2. GPU PyTorch CUDA CSR SpMV PageRank (`torch.sparse_csr_tensor`)
  3. GPU NVIDIA RAPIDS cuGraph / pylibcugraph PageRank (`pylibcugraph.pagerank`)
and emits `docs/reports/p16-graph-csr-cugraph-parity-receipt-v1.json`.

Writes: 0 to canonical databases.
"""
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
import torch

ROOT = Path(__file__).resolve().parent.parent
COHORT_RECEIPT_PATH = ROOT / "docs" / "reports" / "p13-p17-stratified-feature-cohort-receipt-v1.json"
OUT_RECEIPT_PATH = ROOT / "docs" / "reports" / "p16-graph-csr-cugraph-parity-receipt-v1.json"

EDGE_TYPE_WEIGHTS = {
    "IMPORTS": 1.0,
    "CALLS": 0.75,
    "RUNE_DEPENDENCY": 0.85,
    "EVENT_DISPATCH": 0.65,
}


def run_cugraph_pagerank(num_nodes: int, edge_accum: dict[tuple[int, int], float], alpha: float) -> dict:
    info: dict = {
        "cugraph_importable": False,
        "pylibcugraph_importable": False,
        "executed": False,
    }
    try:
        import cugraph  # type: ignore
        import cudf  # type: ignore
        import pylibcugraph  # type: ignore

        info["cugraph_importable"] = True
        info["pylibcugraph_importable"] = True
        info["cugraph_version"] = getattr(cugraph, "__version__", "unknown")
        info["pylibcugraph_version"] = getattr(pylibcugraph, "__version__", "unknown")

        src_list = [u for (u, _v) in edge_accum.keys()]
        dst_list = [v for (_u, v) in edge_accum.keys()]
        wgt_list = [float(w) for w in edge_accum.values()]

        t0 = time.perf_counter()
        df = cudf.DataFrame({"src": src_list, "dst": dst_list, "weight": wgt_list})
        cg = cugraph.Graph(directed=True)
        cg.from_cudf_edgelist(df, source="src", destination="dst", edge_attr="weight", renumber=True)
        pr_df = cugraph.pagerank(cg, alpha=alpha, tol=1e-8, max_iter=500)
        cugraph_ms = (time.perf_counter() - t0) * 1000.0

        pr_map = dict(
            zip(
                pr_df["vertex"].to_numpy().tolist(),
                pr_df["pagerank"].to_numpy().tolist(),
            )
        )
        pr_vec = np.array([pr_map.get(i, 0.0) for i in range(num_nodes)], dtype=np.float64)
        if pr_vec.sum() > 0:
            pr_vec = pr_vec / pr_vec.sum()

        info["executed"] = True
        info["cugraphLatencyMs"] = round(cugraph_ms, 4)
        info["pagerankVector"] = pr_vec
    except Exception as exc:
        info["detail"] = f"{type(exc).__name__}: {exc}"
    return info


def main() -> None:
    cohort = json.loads(COHORT_RECEIPT_PATH.read_text(encoding="utf-8"))
    ordinals = cohort["candidateOrdinals"]
    admitted_edges = cohort["admittedEdges"]

    node_to_id: dict[str, int] = {}
    id_to_node: list[str] = []
    for item in ordinals:
        src = item["sourceRef"]
        node_to_id[src] = item["ordinal"]
        id_to_node.append(src)

    for edge in admitted_edges:
        target = edge["targetSpec"]
        resolved_target = target
        for cand_src in list(node_to_id.keys())[:50]:
            cand_stem = Path(cand_src).stem
            if (
                target.endswith(f"/{cand_stem}")
                or target.endswith(f"/{cand_stem}.js")
                or target.endswith(f"/{cand_stem}.ts")
            ):
                resolved_target = cand_src
                break
        edge["resolvedTarget"] = resolved_target
        if resolved_target not in node_to_id:
            node_to_id[resolved_target] = len(id_to_node)
            id_to_node.append(resolved_target)

    num_nodes = len(id_to_node)

    G = nx.DiGraph()
    for idx in range(num_nodes):
        G.add_node(idx, label=id_to_node[idx], is_cohort_candidate=(idx < 50))

    edge_accum: dict[tuple[int, int], float] = {}
    for edge in admitted_edges:
        u = node_to_id[edge["sourceFile"]]
        v = node_to_id[edge["resolvedTarget"]]
        w = EDGE_TYPE_WEIGHTS.get(edge["edgeType"], 0.5)
        edge_accum[(u, v)] = edge_accum.get((u, v), 0.0) + w

    for (u, v), w in sorted(edge_accum.items()):
        G.add_edge(u, v, weight=float(w))

    indptr = np.zeros(num_nodes + 1, dtype=np.int32)
    indices_list: list[int] = []
    weights_list: list[float] = []

    for u in range(num_nodes):
        nbrs = sorted(G[u].items(), key=lambda kv: kv[0])
        indptr[u + 1] = indptr[u] + len(nbrs)
        for v, data in nbrs:
            indices_list.append(v)
            weights_list.append(float(data["weight"]))

    indices = np.asarray(indices_list, dtype=np.int32)
    weights = np.asarray(weights_list, dtype=np.float32)

    csr_valid = (
        len(indptr) == num_nodes + 1
        and int(indptr[-1]) == len(indices) == len(weights)
        and bool(np.all(np.diff(indptr) >= 0))
    )
    if not csr_valid:
        raise RuntimeError("CSR invariant check failed")

    csr_hasher = hashlib.sha256()
    csr_hasher.update(indptr.tobytes())
    csr_hasher.update(indices.tobytes())
    csr_hasher.update(weights.tobytes())
    csr_checksum = f"sha256:{csr_hasher.hexdigest()}"

    # 1. CPU NetworkX PageRank
    t0 = time.perf_counter()
    nx_pr_dict = nx.pagerank(G, alpha=0.85, tol=1e-9, max_iter=500, weight="weight")
    cpu_ms = (time.perf_counter() - t0) * 1000.0
    nx_pr = np.array([nx_pr_dict[i] for i in range(num_nodes)], dtype=np.float64)

    # 2. GPU CSR Power-Iteration PageRank (PyTorch CUDA CSR / SpMV on RTX 3060 Ti)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    alpha = 0.85

    out_strength = np.zeros(num_nodes, dtype=np.float64)
    for u in range(num_nodes):
        start, end = indptr[u], indptr[u + 1]
        if end > start:
            out_strength[u] = float(np.sum(weights[start:end]))

    in_edges: list[list[tuple[int, float]]] = [[] for _ in range(num_nodes)]
    for u in range(num_nodes):
        start, end = indptr[u], indptr[u + 1]
        if out_strength[u] > 0:
            for idx in range(start, end):
                v = int(indices[idx])
                prob = float(weights[idx]) / out_strength[u]
                in_edges[v].append((u, prob))

    pt_indptr = np.zeros(num_nodes + 1, dtype=np.int64)
    pt_indices_list: list[int] = []
    pt_values_list: list[float] = []
    for v in range(num_nodes):
        row = sorted(in_edges[v], key=lambda x: x[0])
        pt_indptr[v + 1] = pt_indptr[v] + len(row)
        for u, prob in row:
            pt_indices_list.append(u)
            pt_values_list.append(prob)

    torch.sparse.check_sparse_tensor_invariants.disable()
    pt_csr = torch.sparse_csr_tensor(
        torch.from_numpy(pt_indptr).to(device),
        torch.tensor(pt_indices_list, dtype=torch.int64, device=device),
        torch.tensor(pt_values_list, dtype=torch.float64, device=device),
        size=(num_nodes, num_nodes),
        dtype=torch.float64,
        device=device,
    )
    dangling_mask = torch.tensor(out_strength == 0.0, dtype=torch.float64, device=device)

    if device.type == "cuda":
        torch.cuda.synchronize()
    t1 = time.perf_counter()
    r = torch.full((num_nodes,), 1.0 / num_nodes, dtype=torch.float64, device=device)
    base_teleport = (1.0 - alpha) / num_nodes
    iters_run = 0
    for it in range(1, 501):
        iters_run = it
        dangling_mass = torch.dot(r, dangling_mask) / num_nodes
        r_next = alpha * (torch.mv(pt_csr, r) + dangling_mass) + base_teleport
        err = torch.sum(torch.abs(r_next - r)).item()
        r = r_next
        if err < num_nodes * 1e-9:
            break
    if device.type == "cuda":
        torch.cuda.synchronize()
    gpu_ms = (time.perf_counter() - t1) * 1000.0

    gpu_pr = r.detach().cpu().numpy()
    max_abs_diff = float(np.max(np.abs(nx_pr - gpu_pr)))
    l1_diff = float(np.sum(np.abs(nx_pr - gpu_pr)))

    # 3. RAPIDS cuGraph PageRank execution
    cugraph_res = run_cugraph_pagerank(num_nodes, edge_accum, alpha)
    cugraph_pr_vec = cugraph_res.pop("pagerankVector", None)
    if cugraph_pr_vec is not None:
        cugraph_res["maxAbsDiffVsNetworkX"] = float(np.max(np.abs(nx_pr - cugraph_pr_vec)))
        cugraph_res["top10CohortOrdinalsCuGraph"] = [int(i) for i in np.argsort(-cugraph_pr_vec[:50])[:10]]

    nx_top10 = [int(i) for i in np.argsort(-nx_pr[:50])[:10]]
    gpu_top10 = [int(i) for i in np.argsort(-gpu_pr[:50])[:10]]
    top10_exact_match = nx_top10 == gpu_top10

    receipt = {
        "schema": "atlas.p16-graph-csr-cugraph-parity-receipt.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "writesPerformed": False,
        "sourceCohortReceipt": "docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json",
        "ordinalMapChecksum": cohort["ordinalMapChecksum"],
        "csrContract": {
            "numNodes": num_nodes,
            "numCohortFileNodes": 50,
            "numExternalTargetNodes": num_nodes - 50,
            "numUniqueDirectedEdges": int(indptr[-1]),
            "indptrLen": len(indptr),
            "indicesLen": len(indices),
            "weightsLen": len(weights),
            "csrInvariantsVerified": csr_valid,
            "csrChecksum": csr_checksum,
        },
        "pageRankParity": {
            "dampingAlpha": alpha,
            "cpuBackend": f"NetworkX {nx.__version__}",
            "gpuBackend": f"PyTorch {torch.__version__} sparse_csr_tensor SpMV ({torch.cuda.get_device_name(0) if device.type == 'cuda' else 'cpu'})",
            "cpuLatencyMs": round(cpu_ms, 4),
            "gpuLatencyMs": round(gpu_ms, 4),
            "gpuIterations": iters_run,
            "maxAbsDiff": max_abs_diff,
            "l1Diff": l1_diff,
            "top10CohortOrdinalsCpu": nx_top10,
            "top10CohortOrdinalsGpu": gpu_top10,
            "top10ExactOrderParity": top10_exact_match,
            "top5CohortFilesByPageRank": [
                {
                    "ordinal": ord_id,
                    "sourceRef": id_to_node[ord_id],
                    "pageRank": round(float(gpu_pr[ord_id]), 8),
                }
                for ord_id in gpu_top10[:5]
            ],
        },
        "rapidsCuGraphExecution": cugraph_res,
        "status": "PASS" if (csr_valid and max_abs_diff < 1e-6 and top10_exact_match) else "FAIL",
    }

    OUT_RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": receipt["status"],
        "csrChecksum": csr_checksum,
        "maxAbsDiff": max_abs_diff,
        "top10ExactOrderParity": top10_exact_match,
        "rapidsCuGraphExecution": cugraph_res,
    }, indent=2))


if __name__ == "__main__":
    main()
