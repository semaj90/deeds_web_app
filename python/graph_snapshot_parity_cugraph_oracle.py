#!/usr/bin/env python3
"""cuGraph (RAPIDS) oracle for the GRAPH_SNAPSHOT_PARITY frozen artifact contract.

Mirrors graph_snapshot_parity_networkx_oracle.py's I/O contract (same
--nodes/--edges/--scores-out/--louvain-out shape) but runs the GPU backend.
Must run inside a RAPIDS environment — on this project that's the WSL2
miniforge env `atlas-rapids-cu13` (RAPIDS requires a CUDA Linux environment;
it does not run natively on Windows). Windows paths passed in via
--nodes/--edges are expected to be reachable through the WSL2 /mnt/c/...
mount.

GraphGpuContext: the graph is loaded and built ONCE, then reused for every
requested algorithm (PageRank, connected_components, Louvain). This is the
architecturally important part — GPU acceleration here means "keep the
topology resident in VRAM and run many kernels against it", not "reload and
rebuild the graph per algorithm".

Run from Windows via:
  wsl.exe -d Ubuntu -- ~/miniforge3/envs/atlas-rapids-cu13/bin/python \
    /mnt/c/.../python/graph_snapshot_parity_cugraph_oracle.py \
    --nodes /mnt/c/.../nodes.parquet --edges /mnt/c/.../edges.parquet
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

try:
    import cudf
    import cugraph
except ImportError as error:
    print(json.dumps({"status": "UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)


class GraphGpuContext:
    """Loads a frozen parity snapshot once and builds both graph views
    (directed for PageRank, undirected for components/Louvain) once. All
    algorithms below reuse these resident graphs rather than rebuilding."""

    def __init__(self, nodes_path: Path, edges_path: Path) -> None:
        t0 = time.perf_counter()
        self.nodes_df = cudf.read_parquet(nodes_path, columns=["gpu_node_id"])
        self.edges_df = cudf.read_parquet(edges_path, columns=["src_gpu_node_id", "dst_gpu_node_id", "weight"])
        self.parquet_read_ms = (time.perf_counter() - t0) * 1000

        self.node_count = len(self.nodes_df)
        self.edge_count = len(self.edges_df)

        # gpu_node_id must be dense [0, node_count-1] with NO duplicates and NO
        # gaps to safely skip cuGraph's internal renumbering step. min==0 and
        # max==count-1 alone is insufficient — {0,1,1,3} satisfies that on a
        # 4-element population while containing a duplicate and a gap. Prove
        # uniqueness explicitly, and prove every edge endpoint is in range,
        # rather than inheriting the exporter's row_number()-1 assignment as
        # an unchecked assumption.
        ids = self.nodes_df["gpu_node_id"]
        unique_count = int(ids.nunique())
        min_id = int(ids.min()) if self.node_count > 0 else 0
        max_id = int(ids.max()) if self.node_count > 0 else -1
        self.dense_ids = (
            self.node_count > 0
            and unique_count == self.node_count
            and min_id == 0
            and max_id == self.node_count - 1
        )
        if self.edge_count > 0:
            assert int(self.edges_df["src_gpu_node_id"].min()) >= 0
            assert int(self.edges_df["dst_gpu_node_id"].min()) >= 0
            assert int(self.edges_df["src_gpu_node_id"].max()) < self.node_count
            assert int(self.edges_df["dst_gpu_node_id"].max()) < self.node_count
        self.renumber = not self.dense_ids

        t1 = time.perf_counter()
        self.directed = cugraph.Graph(directed=True)
        self.undirected = cugraph.Graph(directed=False)
        if self.edge_count > 0:
            self.directed.from_cudf_edgelist(
                self.edges_df,
                source="src_gpu_node_id",
                destination="dst_gpu_node_id",
                edge_attr="weight",
                vertices=self.nodes_df["gpu_node_id"],
                renumber=self.renumber,
                store_transposed=True,  # PageRank reads this internally; avoids its own perf warning.
            )
            # Bug fixed here: this graph previously omitted edge_attr='weight',
            # making cugraph.louvain(ctx.undirected) run on an UNWEIGHTED graph
            # while the NetworkX oracle used weight='weight'. That would have
            # invalidated any ARI/NMI comparison between the two partitions
            # even if the numbers happened to look plausible.
            self.undirected.from_cudf_edgelist(
                self.edges_df,
                source="src_gpu_node_id",
                destination="dst_gpu_node_id",
                edge_attr="weight",
                vertices=self.nodes_df["gpu_node_id"],
                renumber=self.renumber,
            )
            assert self.undirected.is_weighted()
        self.graph_build_ms = (time.perf_counter() - t1) * 1000


def compute_edge_projection_diagnostics(edges_df) -> dict:
    """Preflight check before trusting cross-backend Louvain comparison:
    cuGraph's undirected graph construction symmetrizes directed edges.
    NetworkX and cuGraph must apply the SAME weight-aggregation policy for
    any duplicate/reciprocal edges, or ARI/NMI compares two different graphs
    wearing the same node count. Computed on the CPU (pandas) — 108k edges is
    trivial there and avoids depending on exact cuDF groupby semantics for a
    one-time diagnostic. If duplicateUnorderedPairs > 0, do not trust the
    Louvain comparison until a single frozen LOUVAIN_PARITY_PROJECTION_V1
    edge table (explicit weight-aggregation policy) feeds both backends."""
    if len(edges_df) == 0:
        return {"orderedDuplicateEdges": 0, "reciprocalEdgePairs": 0, "duplicateUnorderedPairs": 0}
    pdf = edges_df[["src_gpu_node_id", "dst_gpu_node_id"]].to_pandas()
    ordered_pairs = list(zip(pdf["src_gpu_node_id"].tolist(), pdf["dst_gpu_node_id"].tolist()))
    ordered_set = set(ordered_pairs)
    ordered_duplicate_edges = len(ordered_pairs) - len(ordered_set)
    reciprocal_edge_pairs = sum(1 for (a, b) in ordered_set if a != b and (b, a) in ordered_set) // 2
    from collections import Counter
    unordered_counter = Counter((min(a, b), max(a, b)) for (a, b) in ordered_pairs)
    duplicate_unordered_pairs = sum(1 for count in unordered_counter.values() if count > 1)
    return {
        "orderedDuplicateEdges": ordered_duplicate_edges,
        "reciprocalEdgePairs": reciprocal_edge_pairs,
        "duplicateUnorderedPairs": duplicate_unordered_pairs,
    }


def run_pagerank(ctx: GraphGpuContext) -> tuple[dict, "cudf.DataFrame | None"]:
    if ctx.edge_count == 0:
        return {"algorithm_ms": 0.0, "result_copy_ms": 0.0}, None
    t0 = time.perf_counter()
    pr_df = cugraph.pagerank(ctx.directed, alpha=0.85, max_iter=100, tol=1e-8)
    algorithm_ms = (time.perf_counter() - t0) * 1000
    return {"algorithm_ms": algorithm_ms}, pr_df


def run_components(ctx: GraphGpuContext) -> int:
    if ctx.edge_count == 0:
        return ctx.node_count
    # Passing vertices=ctx.nodes_df['gpu_node_id'] at graph-build time means
    # cuGraph already knows the full vertex population, isolated vertices
    # included — connected_components() returns one label per graph vertex.
    # The previous manual "+ isolated_count" correction was needed only when
    # the graph was built edge-list-only; keeping it after adding vertices=
    # would have double-counted isolates on any future snapshot that has
    # them (this corpus happens to have 0, so the old code's answer was
    # accidentally correct here — asserting the row count makes that a
    # proven invariant instead of a coincidence).
    components_df = cugraph.connected_components(ctx.undirected)
    assert len(components_df) == ctx.node_count
    return int(components_df["labels"].nunique())


def run_louvain(ctx: GraphGpuContext) -> tuple[dict, "cudf.DataFrame | None", float | None]:
    """LOUVAIN_PARITY_PROJECTION_V1: undirected, self-loops dropped (none
    present in this corpus — checked, not assumed), single 'weight' edge
    property, resolution=1.0, threshold=1e-7, max_level=100. Applied
    identically by the NetworkX oracle so the two partitions are comparable."""
    if ctx.edge_count == 0:
        return {"algorithm_ms": 0.0}, None, None
    t0 = time.perf_counter()
    partition_df, modularity = cugraph.louvain(ctx.undirected, resolution=1.0, threshold=1e-7, max_level=100)
    algorithm_ms = (time.perf_counter() - t0) * 1000
    return {"algorithm_ms": algorithm_ms}, partition_df, float(modularity)


def write_ndjson(path: Path, pandas_df, id_col: str, value_col: str, out_key: str) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in pandas_df.itertuples(index=False):
            handle.write(json.dumps({"gpuNodeId": int(getattr(row, id_col)), out_key: getattr(row, value_col)}) + "\n")


def run(nodes_path: Path, edges_path: Path, scores_out: Path | None, louvain_out: Path | None) -> dict:
    ctx = GraphGpuContext(nodes_path, edges_path)

    if ctx.node_count == 0:
        return {"backend": "cugraph", "status": "SKIP", "nodeCount": 0, "edgeCount": 0, "componentCount": 0}

    timings = {"parquet_read_ms": ctx.parquet_read_ms, "graph_build_ms": ctx.graph_build_ms}

    pr_timing, pr_df = run_pagerank(ctx)
    timings["pagerank_kernel_ms"] = pr_timing.get("algorithm_ms", 0.0)
    if pr_df is not None and scores_out is not None:
        t0 = time.perf_counter()
        write_ndjson(scores_out, pr_df.to_pandas().sort_values("vertex"), "vertex", "pagerank", "pagerankRaw")
        timings["pagerank_result_copy_ms"] = (time.perf_counter() - t0) * 1000

    edge_projection_diagnostics = compute_edge_projection_diagnostics(ctx.edges_df)

    component_count = run_components(ctx)

    louvain_timing, partition_df, modularity = run_louvain(ctx)
    timings["louvain_kernel_ms"] = louvain_timing.get("algorithm_ms", 0.0)
    community_count = None
    if partition_df is not None and louvain_out is not None:
        t0 = time.perf_counter()
        partition_pandas = partition_df.to_pandas().sort_values("vertex")
        write_ndjson(louvain_out, partition_pandas, "vertex", "partition", "communityId")
        timings["louvain_result_copy_ms"] = (time.perf_counter() - t0) * 1000
        community_count = int(partition_pandas["partition"].nunique())

    return {
        "backend": "cugraph",
        # "EXECUTED", not "PROVEN": this oracle successfully ran cuGraph
        # kernels against the resident graph — that proves
        # CUGRAPH_LOUVAIN_EXECUTED, nothing more. It does NOT prove
        # GRAPH_LOUVAIN_PARTITION_PARITY_PROVEN — only the caller that joins
        # this output against the NetworkX oracle's output by gpu_node_id and
        # computes ARI/NMI is allowed to claim that. An oracle should never
        # be the one deciding it succeeded at cross-backend parity.
        "status": "EXECUTED",
        "nodeCount": ctx.node_count,
        "edgeCount": ctx.edge_count,
        "componentCount": component_count,
        "renumbered": ctx.renumber,
        "louvainModularity": modularity,
        "louvainCommunityCount": community_count,
        "louvainProjection": "LOUVAIN_PARITY_PROJECTION_V1",
        "edgeProjectionDiagnostics": edge_projection_diagnostics,
        "timings": timings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--edges", type=Path, required=True)
    parser.add_argument("--scores-out", type=Path, default=None)
    parser.add_argument("--louvain-out", type=Path, default=None)
    args = parser.parse_args()

    if not args.nodes.exists() or not args.edges.exists():
        print(json.dumps({"status": "UNAVAILABLE", "reason": "nodes.parquet or edges.parquet not found"}))
        return 2

    print(json.dumps(run(args.nodes, args.edges, args.scores_out, args.louvain_out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
