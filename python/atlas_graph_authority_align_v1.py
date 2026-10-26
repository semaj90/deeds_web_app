#!/usr/bin/env python3
"""atlas_graph_authority_align_v1.py - align custom NetworkX PageRank + CheiRank on ONE frozen graph revision.

Read-only. Loads the frozen snapshot (nodes/edges parquet + manifest), runs the repo's own NetworkX executor
(python/atlas_graph_runtime/networkx_executor.py: run_pagerank_v2, run_cheirank) on the same canonical input, then:
  1. checks PageRank against the stored NetworkX run in atlas_graph_authority_scores_v2,
  2. compares CheiRank/PageRank against the Neo4j GDS values in graph_node_metrics (different graph revisions),
  3. reports graph structure (components, distinct score values) so a degenerate graph is visible.
Nothing is written to any datastore; --out writes a checksummed receipt JSON.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "python"))


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        return dsn
    for line in (REPO / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not set")


def spearman(a: dict, b: dict) -> tuple[float | None, int]:
    import pandas as pd
    keys = sorted(set(a) & set(b))
    if len(keys) < 3:
        return None, len(keys)
    sa = pd.Series([a[k] for k in keys]).rank(method="average")
    sb = pd.Series([b[k] for k in keys]).rank(method="average")
    if sa.nunique() < 2 or sb.nunique() < 2:
        return None, len(keys)  # constant ranking: correlation undefined
    return float(sa.corr(sb)), len(keys)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default=str(REPO / "sveltekit-frontend/docs/reports/graph-snapshot-parity"))
    ap.add_argument("--out")
    args = ap.parse_args()

    import pandas as pd
    import psycopg2
    from atlas_graph_runtime.contracts import TypedGraphEdge
    from atlas_graph_runtime.networkx_executor import run_cheirank, run_pagerank_v2

    snap = Path(args.snapshot)
    manifest = json.loads((snap / "manifest.json").read_text(encoding="utf-8"))
    revision = manifest.get("graphRevision") or json.loads((snap / "receipt.json").read_text(encoding="utf-8"))["graphRevision"]
    nodes = pd.read_parquet(snap / "nodes.parquet")
    edges = pd.read_parquet(snap / "edges.parquet")
    ordinals = [int(x) for x in nodes["gpu_node_id"]]
    typed = [TypedGraphEdge(int(s), int(d), str(k), float(w))
             for s, d, k, w in zip(edges["src_gpu_node_id"], edges["dst_gpu_node_id"], edges["edge_type"], edges["weight"])]

    pr, pr_receipt = run_pagerank_v2(graph_revision=revision, node_ordinals=ordinals, edges=typed)
    ch, ch_receipt = run_cheirank(graph_revision=revision, node_ordinals=ordinals, edges=typed)

    # structure
    import networkx as nx
    g = nx.DiGraph()
    g.add_nodes_from(ordinals)
    g.add_edges_from((e.src_ordinal, e.dst_ordinal) for e in typed)
    comps = Counter(len(c) for c in nx.weakly_connected_components(g))
    distinct_pr = len({round(v, 12) for v in pr.values()})
    distinct_ch = len({round(v, 12) for v in ch.values()})

    key_by_ordinal = dict(zip(nodes["gpu_node_id"].astype(int), nodes["graph_node_key"]))
    pk_by_ordinal = dict(zip(nodes["gpu_node_id"].astype(int), nodes["packet_key"]))

    conn = psycopg2.connect(_dsn())
    conn.set_session(readonly=True)
    with conn.cursor() as cur:
        cur.execute("""SELECT s.node_key, s.pagerank_raw FROM atlas_graph_authority_scores_v2 s
                       JOIN atlas_graph_authority_runs_v2 r USING (run_id) WHERE r.topology_hash = %s""", (revision,))
        stored = {k: float(v) for k, v in cur.fetchall()}
        cur.execute("""SELECT metric_name, packet_key, metric_value, run_id::text, graph_revision FROM graph_node_metrics
                       WHERE metric_name IN ('pagerank','cheirank')""")
        gds = {"pagerank": {}, "cheirank": {}}
        gds_rev = {"pagerank": set(), "cheirank": set()}
        for name, pk, val, _run, grev in cur.fetchall():
            gds[name][pk] = float(val)  # duplicate runs carry identical packet sets; last wins
            gds_rev[name].add(grev)
    conn.close()

    ours_pr_by_key = {key_by_ordinal[o]: v for o, v in pr.items()}
    max_delta = max((abs(ours_pr_by_key[k] - stored[k]) for k in stored if k in ours_pr_by_key), default=None)
    packet_pr = {pk_by_ordinal[o]: v for o, v in pr.items() if pk_by_ordinal.get(o)}
    packet_ch = {pk_by_ordinal[o]: v for o, v in ch.items() if pk_by_ordinal.get(o)}
    rho_pr_gds_pr, n1 = spearman(packet_pr, gds["pagerank"])
    rho_ch_gds_ch, n2 = spearman(packet_ch, gds["cheirank"])
    rho_ch_pr, n3 = spearman(packet_ch, packet_pr)

    receipt = {
        "schema": "atlas.graph-authority-alignment.v1", "graphRevision": revision,
        "nodeCount": len(ordinals), "edgeCount": len(typed),
        "weaklyConnectedComponentSizes": {str(k): v for k, v in sorted(comps.items())},
        "distinctPagerankValues": distinct_pr, "distinctCheirankValues": distinct_ch,
        "storedNetworkxPagerankRows": len(stored),
        "maxAbsDeltaVsStoredNetworkxPagerank": max_delta,
        "executorReceipts": {"pagerank": getattr(pr_receipt, "output_checksum", None), "cheirank": getattr(ch_receipt, "output_checksum", None)},
        "gdsGraphRevisions": {k: sorted(v) for k, v in gds_rev.items()},
        "spearman": {"networkxPagerank_vs_gdsPagerank": {"rho": rho_pr_gds_pr, "n": n1},
                     "networkxCheirank_vs_gdsCheirank": {"rho": rho_ch_gds_ch, "n": n2},
                     "networkxCheirank_vs_networkxPagerank": {"rho": rho_ch_pr, "n": n3}},
        "writesPerformed": False, "canonicalAuthority": False,
    }
    receipt["receiptChecksum"] = hashlib.sha256(json.dumps(receipt, sort_keys=True, default=str).encode()).hexdigest()
    text = json.dumps(receipt, indent=1, default=str)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
