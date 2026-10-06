#!/usr/bin/env python3
"""Fan-out capability graphs for analysis (NetworkX) and accelerator-lane alignment.

Consumes a fan-out capability audit JSON (atlas.fanout-capability-audit.v1) and builds:

  A1  co-reference graph  : capability <-> capability, weight = shared matched files.
                            Static co-location only; NOT lineage and NOT a call graph.
  A2  declared stage DAG  : capability -> capability across the declared fan-out stage
                            order. Illustrative plan topology, NOT observed execution.
  B   accelerator graph   : a deep copy of A2 plus accelerator-lane nodes and explicit
                            PROPOSED capability -> lane alignment edges (cuVS, cuGraph,
                            RTX cuBLASLt/LibTorch, RAPIDS cuML/cuDF, simdjson CPU SIMD,
                            SIMT CUB/cuTile). Proposals, not proof of GPU execution.

PageRank is NOT reimplemented here. The repo's dependency-free mathematical reference
(python/parent_atlas_pagerank_reference.py) and NetworkX are both run on each graph and
compared (max absolute delta, top-k overlap, Kendall tau). This script is an analysis
harness, not a graph owner: canonicalAuthority is always false and nothing is written to
any datastore. Run it with the WSL RAPIDS env python (it has NetworkX):
  /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python python/atlas_fanout_graph_alignment_v1.py --audit <json>
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    import networkx as nx
except ImportError as error:
    print(json.dumps({"status": "NETWORKX_UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)

from parent_atlas_pagerank_reference import WeightedEdge, pagerank as reference_pagerank  # noqa: E402

SCHEMA = "atlas.fanout-graph-alignment.v1"
STAGE_ORDER = ["CLASSIFICATION", "ROUTING", "FEATURE_EXTRACTION", "EXPANSION", "PROMOTION", "CACHE"]
STAGE_ORDER_BASIS = "operator plan: classify -> route -> seeds -> expand -> promote -> ACE/cache (illustrative, not observed)"

# Capability -> accelerator lane. `basis` quotes the standing repo rule it comes from; None = no repo
# rule found, so the edge is an UNVERIFIED_PROPOSAL. Parsing, FTS, CRUD and joins are CPU work by rule.
LANES = {
    "CUVS": "cuVS ANN and KMeans executor (WSL atlas-rapids-cu13)",
    "CUGRAPH": "cuGraph PageRank/BFS (parity oracle: NetworkX)",
    "RTX_CUBLASLT_LIBTORCH": "cuBLASLt / LibTorch dense scoring via tensorrt_bridge.node",
    "RAPIDS_CUML_CUDF": "RAPIDS cuML/cuDF tabular and decomposition",
    "SIMDJSON_CPU_SIMD": "simdjson AVX2/SSE4.2 CPU SIMD JSON parsing (not GPU)",
    "SIMT_CUB_CUTILE": "SIMT CUB radix / cuTile residency key kernels",
}
ALIGNMENT = [
    ("semantic_768", "CUVS", "cuVS = ANN"),
    ("semantic_768", "RTX_CUBLASLT_LIBTORCH", "cuBLASLt = dense scoring"),
    ("cuvs", "CUVS", "cuVS = ANN"),
    ("kmeans", "CUVS", "KMeans executor is cuVS (run_cuvs_soft_kmeans)"),
    ("centroid", "CUVS", None),
    ("pca", "RAPIDS_CUML_CUDF", None),
    ("svd", "RAPIDS_CUML_CUDF", None),
    ("umap", "RAPIDS_CUML_CUDF", None),
    ("graphify", "CUGRAPH", "cuGraph = PageRank/BFS"),
    ("packet_incidence", "CUGRAPH", "cuGraph = PageRank/BFS"),
    ("ontology", "CUGRAPH", None),
    ("cugraph", "CUGRAPH", "cuGraph = PageRank/BFS"),
    ("simdjson", "SIMDJSON_CPU_SIMD", "simdjson is CPU SIMD, not GPU"),
    ("ace_packet", "SIMDJSON_CPU_SIMD", None),
    ("context_manifest", "SIMDJSON_CPU_SIMD", None),
    ("mcp", "SIMDJSON_CPU_SIMD", None),
    ("bitfrost", "SIMT_CUB_CUTILE", "CUB radix is a backend under ACE/BitFrost residency"),
]
LANE_KNOWN_STATE = {  # quoted from root CLAUDE.md; not re-measured here
    "CUVS": "CAGRA recall measured on semantic_768; run_cuvs_soft_kmeans fails on cuvs 26.6 until pairwise_distance is wrapped with cp.asarray",
    "CUGRAPH": "NetworkX<->cuGraph PageRank+Louvain parity PASS on the 162,234-node snapshot (docs/reports/graph-snapshot-parity/receipt.json)",
    "RTX_CUBLASLT_LIBTORCH": "tensorrt_bridge.node cu130 loads on RTX 3060 Ti sm_86; no parity/latency/VRAM proof exists for removal (LIBTORCH-PARITY-01)",
    "RAPIDS_CUML_CUDF": "no owner confirmed by this script; every edge to it is an unverified proposal",
    "SIMDJSON_CPU_SIMD": "native addon with V8 fallback; payloads under 1 KB bypass native",
    "SIMT_CUB_CUTILE": "ladder L2 and L3 cuTile DRY_RUN_PROVEN, CUB half DRY_RUN_PROVEN; nothing production-promoted",
}


def sha(obj) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


EXCLUDED_ROLES = {"TEST_OR_DOCUMENTATION"}


def build_colocation(caps: list[dict]):
    files, excluded = {}, 0
    for c in caps:
        kept = set()
        for m in c.get("matchedFiles") or []:
            if m.get("role") in EXCLUDED_ROLES:
                excluded += 1
            else:
                kept.add(m["file"])
        files[c["capability"]] = kept
    edges = []
    for a, b in combinations(sorted(files), 2):
        w = len(files[a] & files[b])
        if w:
            edges.append({"src": a, "dst": b, "weight": float(w), "edgeKind": "COLOCATION"})
            edges.append({"src": b, "dst": a, "weight": float(w), "edgeKind": "COLOCATION"})
    return sorted(files), edges, excluded


def build_stage_dag(caps: list[dict]):
    by_stage = {s: sorted(c["capability"] for c in caps if c.get("fanoutStage") == s) for s in STAGE_ORDER}
    edges = []
    for s, t in zip(STAGE_ORDER, STAGE_ORDER[1:]):
        for a in by_stage[s]:
            for b in by_stage[t]:
                edges.append({"src": a, "dst": b, "weight": 1.0, "edgeKind": "DECLARED_STAGE_ORDER"})
    unstaged = sorted(c["capability"] for c in caps if c.get("fanoutStage") not in STAGE_ORDER)
    return sorted(c["capability"] for c in caps), edges, by_stage, unstaged


def kendall_tau(rank_a: dict, rank_b: dict) -> float:
    keys = sorted(rank_a)
    conc = disc = 0
    for i, j in combinations(keys, 2):
        d = (rank_a[i] - rank_a[j]) * (rank_b[i] - rank_b[j])
        if d > 0:
            conc += 1
        elif d < 0:
            disc += 1
    total = conc + disc
    return (conc - disc) / total if total else 1.0


def analyse(nodes: list[str], edges: list[dict]) -> dict:
    g = nx.DiGraph()
    g.add_nodes_from(nodes)
    g.add_weighted_edges_from((e["src"], e["dst"], e["weight"]) for e in edges)
    nxpr = nx.pagerank(g, alpha=0.85, max_iter=1000, tol=1e-12, weight="weight")
    refpr = reference_pagerank(nodes, [WeightedEdge(e["src"], e["dst"], e["weight"]) for e in edges], damping=0.85)
    deltas = {n: abs(nxpr[n] - refpr[n]) for n in nodes}
    top = lambda d, k: [n for n, _ in sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]
    k = min(5, len(nodes))
    return {
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "isDag": nx.is_directed_acyclic_graph(g),
        "weaklyConnectedComponents": nx.number_weakly_connected_components(g),
        "pagerankMaxAbsDelta_networkx_vs_reference": max(deltas.values()) if deltas else 0.0,
        "pagerankTop5Overlap": len(set(top(nxpr, k)) & set(top(refpr, k))),
        "pagerankKendallTau": kendall_tau(nxpr, refpr),
        "pagerankTop5_networkx": [(n, round(nxpr[n], 6)) for n in top(nxpr, k)],
        "pagerankTop5_reference": [(n, round(refpr[n], 6)) for n in top(refpr, k)],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", type=Path, required=True)
    ap.add_argument("--probes", type=Path, help="optional variadic ast-grep probe JSON to embed as a summary")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    audit_bytes = args.audit.read_bytes()
    audit = json.loads(audit_bytes)
    caps = audit["capabilities"]

    a1_nodes, a1_edges, a1_excluded = build_colocation(caps)
    a2_nodes, a2_edges, by_stage, unstaged = build_stage_dag(caps)

    # B: copy the DAG, then add lane nodes and proposal edges.
    b_nodes = copy.deepcopy(a2_nodes) + sorted(f"lane:{l}" for l in LANES)
    b_edges = copy.deepcopy(a2_edges)
    known = set(a2_nodes)
    proposals, unknown_caps = [], []
    for cap, lane, basis in ALIGNMENT:
        if cap not in known:
            unknown_caps.append(cap)
            continue
        status = "RULE_BACKED_PROPOSAL" if basis else "UNVERIFIED_PROPOSAL"
        b_edges.append({"src": cap, "dst": f"lane:{lane}", "weight": 1.0, "edgeKind": "PROPOSED_ACCELERATOR_ALIGNMENT"})
        proposals.append({"capability": cap, "lane": lane, "basis": basis, "status": status})
    aligned = {p["capability"] for p in proposals}
    cpu_only = sorted(known - aligned)

    receipt = {
        "schema": SCHEMA,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "gpuExecuted": False,
        "sourceAudit": {"path": str(args.audit), "schema": audit.get("schema"), "sha256": "sha256:" + hashlib.sha256(audit_bytes).hexdigest(), "capabilities": len(caps)},
        "networkxVersion": nx.__version__,
        "caveats": [
            "A1 weights come from matchedFiles, which the source audit truncates (max 40 per capability against referenceFileCount); weights are biased samples of co-location, not lineage.",
            "A2 edges are the declared stage order, a plan topology; PageRank over it measures that topology, not observed dependence.",
            "B accelerator edges are proposals; no GPU kernel ran here and no lane is proven by this receipt.",
            "NetworkX and the repo reference agreeing on a graph proves arithmetic parity only, not that the graph is meaningful.",
        ],
        "colocationMatchedFilesExcludedAsTestOrDocumentation": a1_excluded,
        "stageOrder": STAGE_ORDER,
        "stageOrderBasis": STAGE_ORDER_BASIS,
        "stageMembership": by_stage,
        "unstagedCapabilities": unstaged,
        "graphs": {
            "A1_colocation": {"analysis": analyse(a1_nodes, a1_edges), "checksum": sha({"n": a1_nodes, "e": a1_edges})},
            "A2_declared_stage_dag": {"analysis": analyse(a2_nodes, a2_edges), "checksum": sha({"n": a2_nodes, "e": a2_edges})},
            "B_accelerator_alignment": {"analysis": analyse(b_nodes, b_edges), "checksum": sha({"n": b_nodes, "e": b_edges}), "copiedFrom": "A2_declared_stage_dag"},
        },
        "accelerator": {
            "lanes": LANES,
            "knownStateQuotedFromRepoDocs": LANE_KNOWN_STATE,
            "alignment": proposals,
            "cpuOnlyOrUnaligned": cpu_only,
            "alignmentCapabilitiesNotInAudit": unknown_caps,
            "ruleBackedCount": sum(1 for p in proposals if p["status"] == "RULE_BACKED_PROPOSAL"),
            "unverifiedCount": sum(1 for p in proposals if p["status"] == "UNVERIFIED_PROPOSAL"),
        },
        "graphExports": {
            "A1_edges": a1_edges,
            "A2_edges": a2_edges,
            "B_nodes": b_nodes,
            "B_edges": b_edges,
        },
    }
    if args.probes:
        probes = json.loads(args.probes.read_text(encoding="utf8"))
        receipt["variadicProbeSummary"] = {
            "probeRevision": "AST_GREP_VARIADIC_ARGS_V2",
            "patterns": {k: f"{k}($$$ARGS)" for k in probes},
            "results": {
                k: {
                    "total": len(v),
                    "nonTest": [f"{m['file']}:{m['line']}" for m in v if not any(x in m["file"] for x in (".spec.", ".test.", "/tests/", "/test/"))][:12],
                }
                for k, v in probes.items()
            },
        }
    receipt["receiptChecksum"] = sha({k: v for k, v in receipt.items() if k != "receiptChecksum"})
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(receipt, indent=1), encoding="utf8")
    summary = {g: {k: v for k, v in d["analysis"].items() if k.startswith(("node", "edge", "isDag", "pagerankMax", "pagerankTop5Overlap", "pagerankKendall"))} for g, d in receipt["graphs"].items()}
    print(json.dumps({"status": "OK", "out": str(args.out), "summary": summary, "ruleBacked": receipt["accelerator"]["ruleBackedCount"], "unverified": receipt["accelerator"]["unverifiedCount"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
