#!/usr/bin/env python3
"""
Prove PageRank parity between NetworkX (CPU correctness oracle) and Neo4j GDS
(persisted canonical projection) on a small, deterministic, stable-identity
fixture — per the operator's PageRank/BM25/BM42 architecture spec, §5
("Required PageRank parity test") and §13 ("Immediate bounded implementation").

Scope, explicitly bounded:
- 6-node, 5-edge directed weighted fixture (same topology as the spec's own
  example: parser -> chunker -> retrieval -> synthesis <- validation,
  synthesis -> recommendation).
- Compares NetworkX vs Neo4j GDS only. cuGraph is skipped — confirmed NOT
  importable in either Windows Python or WSL this session (GS1.31) — and the
  spec itself says "Run cuGraph only if it is already importable."
- Uses a dedicated, prefixed fixture label/relationship type
  (PRFixtureNode / PR_FIXTURE_EDGE) so this proof cannot collide with real
  graph data, and cleans up (drops the GDS projection + deletes the fixture
  nodes/edges) after running — leaves zero residue in the live graph.
- Does not require RAPIDS/cuVS/CuPy. Does not touch atlas_packets,
  atlas_tree_nodes, or any production Postgres/Qdrant data.

Usage:
    python scripts/atlas/prove-pagerank-networkx-neo4j-parity.py
    python scripts/atlas/prove-pagerank-networkx-neo4j-parity.py --keep-fixture
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import networkx as nx
    NETWORKX_AVAILABLE = True
except ImportError:
    NETWORKX_AVAILABLE = False

try:
    from neo4j import GraphDatabase
    NEO4J_DRIVER_AVAILABLE = True
except ImportError:
    NEO4J_DRIVER_AVAILABLE = False

try:
    # Import order matters here: in this repo's RAPIDS conda env
    # (atlas-rapids-cu13), importing cudf/cugraph before torch fails with
    # `undefined symbol: cublasLtZZZMatmulAlgoGetHeuristicForStream` —
    # torch's bundled CUDA libs resolve the symbol conda's RAPIDS build
    # otherwise can't find. Confirmed via isolated reproduction (GS1.33).
    # Harmless if torch isn't installed in whatever env this runs under.
    try:
        import torch  # noqa: F401
    except ImportError:
        pass
    import cudf
    import cugraph
    CUGRAPH_AVAILABLE = True
except ImportError:
    CUGRAPH_AVAILABLE = False


FIXTURE_NODES = ["parser", "chunker", "retrieval", "validation", "synthesis", "recommendation"]
FIXTURE_EDGES = [
    ("parser", "chunker", 1.0),
    ("chunker", "retrieval", 1.0),
    ("retrieval", "synthesis", 1.0),
    ("validation", "synthesis", 2.0),
    ("synthesis", "recommendation", 1.0),
]
FIXTURE_LABEL = "PRFixtureNode"
FIXTURE_REL = "PR_FIXTURE_EDGE"
FIXTURE_PROJECTION = "prFixtureParityCheck"

PAGERANK_ALPHA = 0.85
PAGERANK_MAX_ITER = 100
PAGERANK_TOL = 1e-8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NetworkX vs Neo4j GDS PageRank parity proof")
    parser.add_argument("--keep-fixture", action="store_true", help="Do not delete fixture nodes/edges after running (debugging only)")
    parser.add_argument("--report-json", default="docs/reports/pagerank-networkx-neo4j-parity.json")
    parser.add_argument("--report-md", default="docs/reports/pagerank-networkx-neo4j-parity.md")
    return parser.parse_args()


def run_networkx_pagerank() -> dict[str, float]:
    graph = nx.DiGraph()
    graph.add_weighted_edges_from(FIXTURE_EDGES)
    return nx.pagerank(graph, alpha=PAGERANK_ALPHA, max_iter=PAGERANK_MAX_ITER, tol=PAGERANK_TOL, weight="weight")


def run_neo4j_gds_pagerank() -> tuple[dict[str, float], dict[str, Any]]:
    uri = os.environ.get("NEO4J_URI", "bolt://127.0.0.1:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD")
    if not password:
        raise RuntimeError("NEO4J_PASSWORD not set in environment")

    driver = GraphDatabase.driver(uri, auth=(user, password))
    meta: dict[str, Any] = {}
    scores: dict[str, float] = {}

    try:
        with driver.session() as session:
            # Clean slate for the fixture namespace (idempotent — safe to re-run).
            session.run(f"MATCH (n:{FIXTURE_LABEL}) DETACH DELETE n")
            try:
                session.run("CALL gds.graph.drop($name, false)", {"name": FIXTURE_PROJECTION})
            except Exception:
                pass  # projection didn't exist — fine

            # Build the fixture.
            for name in FIXTURE_NODES:
                session.run(f"CREATE (:{FIXTURE_LABEL} {{name: $name}})", {"name": name})
            for src, dst, weight in FIXTURE_EDGES:
                session.run(
                    f"""
                    MATCH (a:{FIXTURE_LABEL} {{name: $src}}), (b:{FIXTURE_LABEL} {{name: $dst}})
                    CREATE (a)-[:{FIXTURE_REL} {{weight: $weight}}]->(b)
                    """,
                    {"src": src, "dst": dst, "weight": weight},
                )

            # Project + run PageRank in stream mode (no persistence needed —
            # this fixture is throwaway, unlike the production run in GS1.31).
            proj_result = session.run(
                """
                CALL gds.graph.project(
                    $name,
                    $label,
                    {
                        REL: { type: $relType, orientation: 'NATURAL', properties: { weight: { property: 'weight', defaultValue: 1.0 } } }
                    }
                )
                YIELD nodeCount, relationshipCount
                """,
                {"name": FIXTURE_PROJECTION, "label": FIXTURE_LABEL, "relType": FIXTURE_REL},
            )
            proj_rec = proj_result.single()
            meta["nodeCount"] = proj_rec["nodeCount"]
            meta["relationshipCount"] = proj_rec["relationshipCount"]

            pr_result = session.run(
                """
                CALL gds.pageRank.stream($name, {
                    maxIterations: $maxIter,
                    dampingFactor: $alpha,
                    tolerance: $tol,
                    relationshipWeightProperty: 'weight'
                })
                YIELD nodeId, score
                RETURN gds.util.asNode(nodeId).name AS name, score
                """,
                {"name": FIXTURE_PROJECTION, "maxIter": PAGERANK_MAX_ITER, "alpha": PAGERANK_ALPHA, "tol": PAGERANK_TOL},
            )
            for record in pr_result:
                scores[record["name"]] = record["score"]

            meta["gdsVersion"] = session.run("RETURN gds.version() AS v").single()["v"]

            session.run("CALL gds.graph.drop($name, false)", {"name": FIXTURE_PROJECTION})
    finally:
        driver.close()

    return scores, meta


def run_cugraph_pagerank() -> dict[str, float]:
    """GPU batch analytics/parity lane — optional, only run if cuGraph is importable."""
    node_index = {name: i for i, name in enumerate(FIXTURE_NODES)}
    src = [node_index[s] for s, _, _ in FIXTURE_EDGES]
    dst = [node_index[d] for _, d, _ in FIXTURE_EDGES]
    weight = [w for _, _, w in FIXTURE_EDGES]

    edges_df = cudf.DataFrame({"src": src, "dst": dst, "weight": weight})
    graph = cugraph.Graph(directed=True)
    graph.from_cudf_edgelist(edges_df, source="src", destination="dst", edge_attr="weight", renumber=True)

    result = cugraph.pagerank(graph, alpha=PAGERANK_ALPHA, tol=PAGERANK_TOL, max_iter=PAGERANK_MAX_ITER)
    result_pd = result.to_pandas()
    index_to_name = {i: name for name, i in node_index.items()}
    return {index_to_name[int(row["vertex"])]: float(row["pagerank"]) for _, row in result_pd.iterrows()}


def normalize(scores: dict[str, float]) -> dict[str, float]:
    total = sum(scores.values())
    if total == 0:
        return {k: 0.0 for k in scores}
    return {k: v / total for k, v in scores.items()}


def cleanup_fixture() -> None:
    uri = os.environ.get("NEO4J_URI", "bolt://127.0.0.1:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD")
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        with driver.session() as session:
            session.run(f"MATCH (n:{FIXTURE_LABEL}) DETACH DELETE n")
    finally:
        driver.close()


def make_md_report(report: dict[str, Any]) -> str:
    lines = [
        "# PageRank NetworkX vs Neo4j GDS Parity Proof",
        "",
        f"Generated: {report['generated_at']}",
        f"Overall status: **{report['status']}**",
        "",
        "## Fixture",
        "",
        "6 nodes, 5 directed weighted edges (same topology as the operator's spec example):",
        "```",
        "parser -> chunker -> retrieval -> synthesis <- validation (weight 2.0)",
        "synthesis -> recommendation",
        "```",
        "",
        "## Normalized scores",
        "",
        "| Node | NetworkX (normalized) | Neo4j GDS (normalized) | cuGraph (normalized) | Delta (max) |",
        "|---|---|---|---|---|",
    ]
    cugraph_norm = report.get("cugraph", {}).get("normalized", {})
    for name in FIXTURE_NODES:
        nx_v = report["networkx"]["normalized"].get(name, 0.0)
        gds_v = report["neo4j_gds"]["normalized"].get(name, 0.0)
        cg_v = cugraph_norm.get(name)
        cg_str = f"{cg_v:.6f}" if cg_v is not None else "n/a"
        deltas = [abs(nx_v - gds_v)] + ([abs(nx_v - cg_v)] if cg_v is not None else [])
        lines.append(f"| {name} | {nx_v:.6f} | {gds_v:.6f} | {cg_str} | {max(deltas):.6f} |")
    lines += [
        "",
        "## Gates",
        "",
        "| Gate | Status |",
        "|---|---|",
    ]
    for gate, status in report["gates"].items():
        lines.append(f"| {gate} | {status} |")
    lines += [
        "",
        f"Max absolute delta (normalized): {report['comparison']['max_abs_delta']:.6f}",
        f"Top-ranked node match: {report['comparison']['top_rank_match']}",
        f"Rank order match: {report['comparison']['rank_order_match']}",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()

    gates: dict[str, str] = {}

    if not NETWORKX_AVAILABLE:
        gates["GRAPH_PAGERANK_NETWORKX"] = "NOT_RUN"
        raise RuntimeError("networkx not importable — cannot run the CPU oracle")
    nx_scores = run_networkx_pagerank()
    gates["GRAPH_PAGERANK_NETWORKX"] = "PASS"

    if not NEO4J_DRIVER_AVAILABLE:
        gates["GRAPH_PAGERANK_NEO4J"] = "NOT_RUN"
        raise RuntimeError("neo4j python driver not importable")

    gds_scores, gds_meta = run_neo4j_gds_pagerank()
    gates["GRAPH_PAGERANK_NEO4J"] = "PASS" if gds_scores else "FAIL"

    # cuGraph — only run if importable, per the spec's own rule. GS1.31 found
    # it absent everywhere; GS1.33 provisioned a working RAPIDS conda env
    # (atlas-rapids-cu13, WSL) where it now is.
    cugraph_scores: dict[str, float] = {}
    if CUGRAPH_AVAILABLE:
        cugraph_scores = run_cugraph_pagerank()
        gates["GRAPH_PAGERANK_CUGRAPH"] = "PASS" if cugraph_scores else "FAIL"
    else:
        gates["GRAPH_PAGERANK_CUGRAPH"] = "NOT_RUN"

    nx_norm = normalize(nx_scores)
    gds_norm = normalize(gds_scores)
    cugraph_norm = normalize(cugraph_scores) if cugraph_scores else {}

    gates["GRAPH_VERTEX_IDENTITY_MAP"] = "PASS" if set(nx_norm.keys()) == set(gds_norm.keys()) == set(FIXTURE_NODES) else "FAIL"

    max_abs_delta = max(abs(nx_norm.get(k, 0.0) - gds_norm.get(k, 0.0)) for k in FIXTURE_NODES)
    nx_top = max(nx_norm, key=nx_norm.get)
    gds_top = max(gds_norm, key=gds_norm.get)
    top_rank_match = nx_top == gds_top

    nx_order = sorted(FIXTURE_NODES, key=lambda k: -nx_norm.get(k, 0.0))
    gds_order = sorted(FIXTURE_NODES, key=lambda k: -gds_norm.get(k, 0.0))
    rank_order_match = nx_order == gds_order

    cugraph_top = max(cugraph_norm, key=cugraph_norm.get) if cugraph_norm else None
    cugraph_order = sorted(FIXTURE_NODES, key=lambda k: -cugraph_norm.get(k, 0.0)) if cugraph_norm else None
    cugraph_top_match = (cugraph_top == nx_top) if cugraph_norm else None
    cugraph_order_match = (cugraph_order == nx_order) if cugraph_norm else None
    if cugraph_norm:
        max_abs_delta = max(max_abs_delta, max(abs(nx_norm.get(k, 0.0) - cugraph_norm.get(k, 0.0)) for k in FIXTURE_NODES))

    # Not "same top-ranked nodes, high rank correlation, bounded numerical
    # error" byte-identical — per the spec's own rule 5: "Do not require
    # byte identical scores."
    parity_tolerance = 0.01
    score_parity_ok = top_rank_match and max_abs_delta < parity_tolerance
    if cugraph_norm:
        score_parity_ok = score_parity_ok and cugraph_top_match
    gates["GRAPH_SCORE_PARITY"] = "PASS" if score_parity_ok else "FAIL"
    # Synthetic fixture has no real source_revision/workspace_revision lineage
    # to check — this gate is structurally not applicable here, honestly
    # labeled rather than forced to PASS.
    gates["GRAPH_REVISION_LINEAGE"] = "NOT_APPLICABLE_SYNTHETIC_FIXTURE"

    overall_status = "PASS" if all(v in ("PASS", "NOT_RUN", "NOT_APPLICABLE_SYNTHETIC_FIXTURE") for v in gates.values()) and gates["GRAPH_SCORE_PARITY"] == "PASS" else "FAIL"

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": overall_status,
        "fixture": {"nodes": FIXTURE_NODES, "edges": FIXTURE_EDGES},
        "networkx": {"raw": nx_scores, "normalized": nx_norm, "params": {"alpha": PAGERANK_ALPHA, "max_iter": PAGERANK_MAX_ITER, "tol": PAGERANK_TOL}},
        "neo4j_gds": {"raw": gds_scores, "normalized": gds_norm, "meta": gds_meta, "params": {"dampingFactor": PAGERANK_ALPHA, "maxIterations": PAGERANK_MAX_ITER, "tolerance": PAGERANK_TOL}},
        "cugraph": {"raw": cugraph_scores, "normalized": cugraph_norm, "ran": bool(cugraph_norm), "params": {"alpha": PAGERANK_ALPHA, "max_iter": PAGERANK_MAX_ITER, "tol": PAGERANK_TOL}},
        "comparison": {
            "max_abs_delta": max_abs_delta,
            "top_rank_match": top_rank_match,
            "rank_order_match": rank_order_match,
            "networkx_top": nx_top,
            "neo4j_gds_top": gds_top,
            "networkx_order": nx_order,
            "neo4j_gds_order": gds_order,
            "cugraph_top": cugraph_top,
            "cugraph_order": cugraph_order,
            "cugraph_top_match": cugraph_top_match,
            "cugraph_order_match": cugraph_order_match,
        },
        "gates": gates,
        "remarks": {
            "cugraph": "ran (see cugraph block)" if cugraph_norm else "skipped — not importable in this environment",
            "fixture_cleanup": "not deleted (--keep-fixture)" if args.keep_fixture else "deleted after run",
        },
    }

    json_path = Path(args.report_json)
    md_path = Path(args.report_md)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    md_path.write_text(make_md_report(report), encoding="utf-8")

    if not args.keep_fixture:
        cleanup_fixture()

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if overall_status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
