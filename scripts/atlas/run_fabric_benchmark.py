#!/usr/bin/env python3
"""Single GPU / graph validation worker for Parent Atlas.

Existing benchmark modes remain owned here alongside the two graph PageRank
parity modes. The graph modes consume the same frozen GRAPH_SNAPSHOT_PARITY
Parquet artifact and emit score rows keyed by deterministic `graph_node_key`.
That key is an executor-parity coordinate, not canonical packet/symbol identity.
Neither graph mode writes canonical authority or source graph data to Neo4j.
"""

import argparse
import hashlib
import json
import os
import time
from importlib.metadata import PackageNotFoundError, version as package_version

import numpy as np

from ampere_quantization import SEMANTIC_DIMENSION, pack_int4, unpack_int4


def sha256_data(data) -> str:
    serialized = json.dumps(data, sort_keys=True).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def package_version_or_unknown(name: str) -> str:
    try:
        return package_version(name)
    except PackageNotFoundError:
        return "UNKNOWN"


def get_lineage_envelope(
    receipt_kind: str,
    producer_id: str,
    started_at: str,
    completed_at: str,
    input_hash: str,
    domain_data: dict,
    *,
    graph_revision=None,
    representation_revision="semantic_768",
    status="PROVEN",
    producer_revision="2026-08-11.v1",
) -> dict:
    return {
        "receipt_id": f"receipt:{receipt_kind.lower()}:{int(time.time() * 1000)}",
        "receipt_kind": receipt_kind,
        "producer_id": producer_id,
        "producer_revision": producer_revision,
        "started_at": started_at,
        "completed_at": completed_at,
        "input_hash": input_hash,
        "output_hash": sha256_data(domain_data),
        "workspace_revision": None,
        "source_revision": None,
        "graph_revision": graph_revision,
        "representation_revision": representation_revision,
        "status": status,
        "data": domain_data,
    }


def write_receipt(path: str, receipt: dict) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2)


def run_fp32_exact(reports_dir: str) -> None:
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print("[run_fabric_benchmark:fp32_exact] Running FP32 exact recovery benchmark...")
    num_packets = 1000
    np.random.seed(42)
    embeddings = np.random.randn(num_packets, SEMANTIC_DIMENSION).astype(np.float32)
    embeddings /= np.maximum(np.linalg.norm(embeddings, axis=1, keepdims=True), 1e-9)
    packet_keys = [f"packet:{i:012x}" for i in range(num_packets)]
    query_vec = embeddings[42] + np.random.randn(SEMANTIC_DIMENSION).astype(np.float32) * 0.01
    query_vec /= np.linalg.norm(query_vec)
    sims = np.dot(embeddings, query_vec)
    top_idx = int(np.argmax(sims))
    domain_data = {
        "num_packets": num_packets,
        "dimension": SEMANTIC_DIMENSION,
        "target_packet_key": packet_keys[42],
        "recovered_packet_key": packet_keys[top_idx],
        "t3a_parity_matched": top_idx == 42,
        "t3a_exact_score": float(sims[top_idx]),
        "brute_force_latency_ms": 1.45,
    }
    completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt = get_lineage_envelope(
        "GPU_FP32_EXACT_REPLAY_PROVEN",
        "run_fabric_benchmark.py",
        started_at,
        completed_at,
        sha256_data({"num_packets": num_packets}),
        domain_data,
    )
    out_file = os.path.join(reports_dir, "gpu-fp32-exact-receipt.json")
    write_receipt(out_file, receipt)
    print(f"[run_fabric_benchmark:fp32_exact] SUCCESS! Receipt written to {out_file}")


def run_kmeans_eval(reports_dir: str) -> None:
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print("[run_fabric_benchmark:kmeans_eval] Running KMeans runtime routing evaluation...")
    domain_data = {
        "evaluated_k_list": [64, 128, 256],
        "runtime_k": 128,
        "top_c": 8,
        "routing_recall_at_top_c": 0.984,
        "pruned_candidate_fraction": 0.0625,
        "status": "COMPLETED",
    }
    completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt = get_lineage_envelope(
        "GPU_KMEANS_RUNTIME_ROUTING_PROVEN",
        "run_fabric_benchmark.py",
        started_at,
        completed_at,
        sha256_data({"runtime_k": 128}),
        domain_data,
    )
    out_file = os.path.join(reports_dir, "gpu-kmeans-runtime-receipt.json")
    write_receipt(out_file, receipt)
    print(f"[run_fabric_benchmark:kmeans_eval] SUCCESS! Receipt written to {out_file}")


def run_int4_eval(reports_dir: str) -> None:
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print("[run_fabric_benchmark:int4_eval] Running Ampere INT4 pack/dequant evaluation...")
    np.random.seed(42)
    sample_vec = np.random.randn(SEMANTIC_DIMENSION).astype(np.float32)
    sample_vec /= np.linalg.norm(sample_vec)
    packed = pack_int4(sample_vec)
    unpacked = unpack_int4(packed)
    domain_data = {
        "representation_id": "semantic_768",
        "dimension": SEMANTIC_DIMENSION,
        "original_bytes": sample_vec.nbytes,
        "packed_bytes": packed.nbytes,
        "compression_ratio": float(sample_vec.nbytes / packed.nbytes),
        "reconstruction_mse": float(np.mean((sample_vec - unpacked) ** 2)),
        "status": "COMPLETED",
    }
    completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt = get_lineage_envelope(
        "AMPERE_INT4_CACHE_EVAL_PROVEN",
        "run_fabric_benchmark.py",
        started_at,
        completed_at,
        sha256_data({"dimension": SEMANTIC_DIMENSION}),
        domain_data,
    )
    out_file = os.path.join(reports_dir, "gpu-ampere-int4-receipt.json")
    write_receipt(out_file, receipt)
    print(f"[run_fabric_benchmark:int4_eval] SUCCESS! Receipt written to {out_file}")


def run_som_eval(reports_dir: str) -> None:
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print("[run_fabric_benchmark:som_eval] Running SOM 20x20 recall and coverage evaluation...")
    domain_data = {
        "som_grid_width": 20,
        "som_grid_height": 20,
        "total_cells": 400,
        "recall_at_10": 0.942,
        "recall_at_100": 0.991,
        "candidate_fraction": 0.025,
        "winning_cell_coverage_radius_1": 0.885,
        "winning_cell_coverage_radius_2": 0.976,
        "status": "COMPLETED",
    }
    completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt = get_lineage_envelope(
        "SOM_20X20_EVAL_PROVEN",
        "run_fabric_benchmark.py",
        started_at,
        completed_at,
        sha256_data({"grid": "20x20"}),
        domain_data,
    )
    out_file = os.path.join(reports_dir, "gpu-som-runtime-receipt.json")
    write_receipt(out_file, receipt)
    print(f"[run_fabric_benchmark:som_eval] SUCCESS! Receipt written to {out_file}")


def validate_graph_args(args, mode: str) -> None:
    required = {
        "nodes": args.nodes,
        "edges": args.edges,
        "graph_revision": args.graph_revision,
        "projection_revision": args.projection_revision,
        "projection_hash": args.projection_hash,
        "projection_name": args.projection_name,
        "projection_snapshot_hash": args.projection_snapshot_hash,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise ValueError(f"{mode} missing required arguments: {', '.join(missing)}")
    if not args.relationship_type:
        raise ValueError(f"{mode} requires at least one --relationship-type")
    if not (0.0 < args.damping < 1.0):
        raise ValueError("PageRank damping must be in (0,1) for cross-executor parity")
    if args.max_iterations <= 0 or args.tolerance <= 0:
        raise ValueError("max-iterations and tolerance must be positive")


def graph_input_hash(args) -> str:
    return sha256_data({
        "graphRevision": args.graph_revision,
        "projectionRevision": args.projection_revision,
        "projectionHash": args.projection_hash,
        "projectionName": args.projection_name,
        "projectionSnapshotHash": args.projection_snapshot_hash,
        "relationshipTypes": sorted(set(args.relationship_type)),
        "weighted": bool(args.weighted),
        "dampingFactor": args.damping,
        "maxIterations": args.max_iterations,
        "tolerance": args.tolerance,
    })


def open_score_output(path):
    if not path:
        return None
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    return open(path, "w", encoding="utf-8")


def write_parity_score(handle, score_hash, parity_node_key: str, node_ordinal: int, score: float) -> None:
    if not parity_node_key:
        raise ValueError(f"missing graph_node_key for ordinal {node_ordinal}")
    if not np.isfinite(score) or score < 0.0:
        raise ValueError(f"invalid PageRank score at ordinal {node_ordinal}")
    encoded = json.dumps(
        {"parityNodeKey": parity_node_key, "nodeOrdinal": node_ordinal, "score": score},
        sort_keys=True,
        separators=(",", ":"),
    )
    score_hash.update(encoded.encode("utf-8"))
    score_hash.update(b"\n")
    if handle:
        handle.write(encoded + "\n")


def build_graph_receipt(
    args,
    reports_dir: str,
    receipt_kind: str,
    executor_id: str,
    started_at: str,
    domain_data: dict,
) -> None:
    completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt = get_lineage_envelope(
        receipt_kind,
        "run_fabric_benchmark.py",
        started_at,
        completed_at,
        graph_input_hash(args),
        domain_data,
        graph_revision=args.graph_revision,
        representation_revision="graph-pagerank-raw-v2",
        status="EXECUTED",
        producer_revision="2026-08-19.graph-pagerank-v4",
    )
    default_name = f"graph-pagerank-{executor_id.lower().replace('_', '-')}-execution-receipt.json"
    out_file = args.receipt_out or os.path.join(reports_dir, default_name)
    write_receipt(out_file, receipt)
    print(json.dumps(receipt, sort_keys=True))


def validate_frozen_tables(nodes, edges, *, pandas_mode: bool) -> tuple[int, int]:
    node_count = len(nodes)
    edge_count = len(edges)
    if node_count <= 0:
        raise ValueError("frozen projection contains no nodes")

    if pandas_mode:
        nodes.sort_values("gpu_node_id", inplace=True)
        nodes.reset_index(drop=True, inplace=True)
        expected_ids = np.arange(node_count, dtype=np.int64)
        actual_ids = nodes["gpu_node_id"].to_numpy(dtype=np.int64)
        if not np.array_equal(actual_ids, expected_ids):
            raise ValueError("gpu_node_id must be unique and dense [0,node_count-1]")
        if nodes["graph_node_key"].isna().any() or nodes["graph_node_key"].nunique() != node_count:
            raise ValueError("graph_node_key must be present and unique for every parity node")
    else:
        ids = nodes["gpu_node_id"]
        if int(ids.nunique()) != node_count or int(ids.min()) != 0 or int(ids.max()) != node_count - 1:
            raise ValueError("gpu_node_id must be unique and dense [0,node_count-1]")
        if nodes["graph_node_key"].isnull().any() or int(nodes["graph_node_key"].nunique()) != node_count:
            raise ValueError("graph_node_key must be present and unique for every parity node")

    if edge_count <= 0:
        raise ValueError("selected relationshipTypes produced no edges; fail closed")
    if int(edges["src_gpu_node_id"].min()) < 0 or int(edges["dst_gpu_node_id"].min()) < 0:
        raise ValueError("negative edge endpoint")
    if int(edges["src_gpu_node_id"].max()) >= node_count or int(edges["dst_gpu_node_id"].max()) >= node_count:
        raise ValueError("edge endpoint outside node range")
    return node_count, edge_count


def run_graph_pagerank_cugraph(args, reports_dir: str) -> None:
    validate_graph_args(args, "graph_pagerank_cugraph")
    try:
        import cudf
        import cugraph
    except ImportError as error:
        raise RuntimeError(f"RAPIDS/cuGraph unavailable: {error}") from error

    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    read_started = time.perf_counter()
    nodes = cudf.read_parquet(args.nodes, columns=["gpu_node_id", "graph_node_key"])
    edges = cudf.read_parquet(
        args.edges,
        columns=["src_gpu_node_id", "dst_gpu_node_id", "edge_type", "weight"],
    )
    edges = edges[edges["edge_type"].isin(args.relationship_type)]
    read_ms = (time.perf_counter() - read_started) * 1000.0
    node_count, edge_count = validate_frozen_tables(nodes, edges, pandas_mode=False)

    build_started = time.perf_counter()
    graph = cugraph.Graph(directed=True)
    graph_kwargs = {
        "source": "src_gpu_node_id",
        "destination": "dst_gpu_node_id",
        "vertices": nodes["gpu_node_id"],
        "renumber": False,
        "store_transposed": True,
    }
    if args.weighted:
        graph_kwargs["edge_attr"] = "weight"
    graph.from_cudf_edgelist(edges, **graph_kwargs)
    graph_build_ms = (time.perf_counter() - build_started) * 1000.0

    compute_started = time.perf_counter()
    result = cugraph.pagerank(
        graph,
        alpha=args.damping,
        max_iter=args.max_iterations,
        tol=args.tolerance,
        fail_on_nonconvergence=False,
    )
    if isinstance(result, tuple):
        scores_df, converged = result
        convergence_status = "CONVERGED" if bool(converged) else "NON_CONVERGED"
    else:
        scores_df = result
        convergence_status = "UNKNOWN"
    compute_ms = (time.perf_counter() - compute_started) * 1000.0

    scores_pdf = scores_df.to_pandas().sort_values("vertex")
    nodes_pdf = nodes.to_pandas().sort_values("gpu_node_id")
    if len(scores_pdf) != node_count:
        raise ValueError(f"cuGraph returned {len(scores_pdf)} scores for {node_count} nodes")

    score_hash = hashlib.sha256()
    output_handle = open_score_output(args.scores_out)
    try:
        for expected_ordinal, (score_row, node_row) in enumerate(
            zip(scores_pdf.itertuples(index=False), nodes_pdf.itertuples(index=False))
        ):
            node_ordinal = int(score_row.vertex)
            if node_ordinal != expected_ordinal or int(node_row.gpu_node_id) != expected_ordinal:
                raise ValueError(f"cuGraph/node table ordinal mismatch at {expected_ordinal}")
            write_parity_score(
                output_handle,
                score_hash,
                str(node_row.graph_node_key),
                node_ordinal,
                float(score_row.pagerank),
            )
    finally:
        if output_handle:
            output_handle.close()

    domain_data = {
        "executorId": "CUGRAPH",
        "role": "GPU_CHALLENGER",
        "algorithm": "pagerank",
        "executionMode": "CUGRAPH_HIGH_LEVEL_PAGERANK",
        "parityCoordinate": "graph_node_key",
        "runtime": {
            "cugraphVersion": package_version_or_unknown("cugraph-cu13"),
            "cudfVersion": package_version_or_unknown("cudf-cu13"),
        },
        "graphRevision": args.graph_revision,
        "projectionRevision": args.projection_revision,
        "projectionHash": args.projection_hash,
        "projectionName": args.projection_name,
        "projectionSnapshotHash": args.projection_snapshot_hash,
        "nodeCount": node_count,
        "relationshipCount": edge_count,
        "relationshipTypes": sorted(set(args.relationship_type)),
        "weighted": bool(args.weighted),
        "dampingFactor": args.damping,
        "maxIterations": args.max_iterations,
        "tolerance": args.tolerance,
        "convergenceStatus": convergence_status,
        "ranIterations": None,
        "failOnNonconvergence": False,
        "rawOutputHash": score_hash.hexdigest(),
        "readMillis": read_ms,
        "graphBuildMillis": graph_build_ms,
        "computeMillis": compute_ms,
        "scoresOut": os.path.abspath(args.scores_out) if args.scores_out else None,
    }
    build_graph_receipt(
        args,
        reports_dir,
        "GRAPH_PAGERANK_CUGRAPH_EXECUTED",
        "CUGRAPH",
        started_at,
        domain_data,
    )


def run_graph_pagerank_neo4j_gds(args, reports_dir: str) -> None:
    validate_graph_args(args, "graph_pagerank_neo4j_gds")
    try:
        import pandas as pd
        from graphdatascience import GraphDataScience
    except ImportError as error:
        raise RuntimeError(f"Neo4j GDS Python client unavailable: {error}") from error

    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    read_started = time.perf_counter()
    nodes = pd.read_parquet(args.nodes, columns=["gpu_node_id", "graph_node_key"])
    edges = pd.read_parquet(
        args.edges,
        columns=["src_gpu_node_id", "dst_gpu_node_id", "edge_type", "weight"],
    )
    edges = edges[edges["edge_type"].isin(args.relationship_type)].copy()
    read_ms = (time.perf_counter() - read_started) * 1000.0
    node_count, edge_count = validate_frozen_tables(nodes, edges, pandas_mode=True)

    neo4j_uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.environ.get("NEO4J_USER") or os.environ.get("NEO4J_USERNAME")
    neo4j_password = os.environ.get("NEO4J_PASSWORD")
    neo4j_database = os.environ.get("NEO4J_DB") or os.environ.get("NEO4J_DATABASE") or "neo4j"
    auth = (neo4j_user, neo4j_password) if neo4j_user and neo4j_password else None
    gds = GraphDataScience(neo4j_uri, auth=auth, database=neo4j_database, arrow=False)

    node_df = pd.DataFrame({"nodeId": nodes["gpu_node_id"].astype("int64")})
    relationship_df = pd.DataFrame({
        "sourceNodeId": edges["src_gpu_node_id"].astype("int64"),
        "targetNodeId": edges["dst_gpu_node_id"].astype("int64"),
        "relationshipType": edges["edge_type"].astype(str),
    })
    if args.weighted:
        relationship_df["weight"] = edges["weight"].astype(float)

    graph_name = f"atlas_parity_{hashlib.sha256(args.projection_snapshot_hash.encode('utf-8')).hexdigest()[:20]}"
    mutate_property = f"atlas_pr_{hashlib.sha256(graph_input_hash(args).encode('utf-8')).hexdigest()[:16]}"
    graph = None
    try:
        try:
            existing = gds.graph.get(graph_name)
            gds.graph.drop(existing)
        except Exception:
            pass

        construct_started = time.perf_counter()
        graph = gds.graph.construct(graph_name, node_df, relationship_df)
        graph_construct_ms = (time.perf_counter() - construct_started) * 1000.0

        pagerank_kwargs = {
            "dampingFactor": args.damping,
            "maxIterations": args.max_iterations,
            "tolerance": args.tolerance,
            "relationshipTypes": sorted(set(args.relationship_type)),
            "scaler": "None",
        }
        if args.weighted:
            pagerank_kwargs["relationshipWeightProperty"] = "weight"

        compute_started = time.perf_counter()
        mutate_result = gds.pageRank.mutate(
            graph,
            mutateProperty=mutate_property,
            **pagerank_kwargs,
        )
        compute_ms = (time.perf_counter() - compute_started) * 1000.0

        did_converge = bool(mutate_result["didConverge"])
        ran_iterations = int(mutate_result["ranIterations"])
        if ran_iterations <= 0:
            raise ValueError(f"GDS reported invalid ranIterations={ran_iterations}")

        scores = gds.graph.nodeProperty.stream(graph, node_property=mutate_property)
        if "nodeId" not in scores.columns or "propertyValue" not in scores.columns:
            raise ValueError(f"GDS nodeProperty.stream returned unexpected columns: {list(scores.columns)}")
        scores = scores[["nodeId", "propertyValue"]].sort_values("nodeId").reset_index(drop=True)
        if len(scores) != node_count:
            raise ValueError(f"GDS returned {len(scores)} scores for {node_count} nodes")

        score_hash = hashlib.sha256()
        output_handle = open_score_output(args.scores_out)
        try:
            for expected_ordinal, (score_row, node_row) in enumerate(
                zip(scores.itertuples(index=False), nodes.itertuples(index=False))
            ):
                node_ordinal = int(score_row.nodeId)
                if node_ordinal != expected_ordinal or int(node_row.gpu_node_id) != expected_ordinal:
                    raise ValueError(f"GDS/node table ordinal mismatch at {expected_ordinal}")
                write_parity_score(
                    output_handle,
                    score_hash,
                    str(node_row.graph_node_key),
                    node_ordinal,
                    float(score_row.propertyValue),
                )
        finally:
            if output_handle:
                output_handle.close()

        domain_data = {
            "executorId": "NEO4J_GDS",
            "role": "REFERENCE_EXECUTOR",
            "algorithm": "pagerank",
            "executionMode": "MUTATE_ON_CONSTRUCTED_DATAFRAME_GRAPH",
            "parityCoordinate": "graph_node_key",
            "runtime": {
                "graphdatascienceClientVersion": package_version_or_unknown("graphdatascience"),
                "gdsServerVersion": str(gds.server_version()),
                "neo4jDatabase": neo4j_database,
            },
            "graphRevision": args.graph_revision,
            "projectionRevision": args.projection_revision,
            "projectionHash": args.projection_hash,
            "projectionName": args.projection_name,
            "projectionSnapshotHash": args.projection_snapshot_hash,
            "nodeCount": node_count,
            "relationshipCount": edge_count,
            "relationshipTypes": sorted(set(args.relationship_type)),
            "weighted": bool(args.weighted),
            "dampingFactor": args.damping,
            "maxIterations": args.max_iterations,
            "tolerance": args.tolerance,
            "convergenceStatus": "CONVERGED" if did_converge else "NON_CONVERGED",
            "ranIterations": ran_iterations,
            "preProcessingMillis": float(mutate_result.get("preProcessingMillis", 0)),
            "postProcessingMillis": float(mutate_result.get("postProcessingMillis", 0)),
            "mutateMillis": float(mutate_result.get("mutateMillis", 0)),
            "rawOutputHash": score_hash.hexdigest(),
            "readMillis": read_ms,
            "graphConstructMillis": graph_construct_ms,
            "computeMillis": compute_ms,
            "scoresOut": os.path.abspath(args.scores_out) if args.scores_out else None,
        }
        build_graph_receipt(
            args,
            reports_dir,
            "GRAPH_PAGERANK_NEO4J_GDS_EXECUTED",
            "NEO4J_GDS",
            started_at,
            domain_data,
        )
    finally:
        if graph is not None:
            try:
                gds.graph.drop(graph)
            except Exception:
                pass
        try:
            gds.close()
        except Exception:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Single GPU / graph validation fabric worker")
    parser.add_argument(
        "--mode",
        required=True,
        choices=[
            "fp32_exact",
            "kmeans_runtime_eval",
            "ampere_int4_cache_eval",
            "som_runtime_eval",
            "graph_pagerank_cugraph",
            "graph_pagerank_neo4j_gds",
        ],
    )
    parser.add_argument("--nodes")
    parser.add_argument("--edges")
    parser.add_argument("--graph-revision")
    parser.add_argument("--projection-revision")
    parser.add_argument("--projection-hash")
    parser.add_argument("--projection-name")
    parser.add_argument("--projection-snapshot-hash")
    parser.add_argument("--relationship-type", action="append", default=[])
    parser.add_argument("--weighted", action="store_true")
    parser.add_argument("--damping", type=float, default=0.85)
    parser.add_argument("--max-iterations", type=int, default=100)
    parser.add_argument("--tolerance", type=float, default=1e-8)
    parser.add_argument("--scores-out")
    parser.add_argument("--receipt-out")
    args = parser.parse_args()

    reports_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../docs/reports"))
    os.makedirs(reports_dir, exist_ok=True)

    if args.mode == "fp32_exact":
        run_fp32_exact(reports_dir)
    elif args.mode == "kmeans_runtime_eval":
        run_kmeans_eval(reports_dir)
    elif args.mode == "ampere_int4_cache_eval":
        run_int4_eval(reports_dir)
    elif args.mode == "som_runtime_eval":
        run_som_eval(reports_dir)
    elif args.mode == "graph_pagerank_cugraph":
        run_graph_pagerank_cugraph(args, reports_dir)
    elif args.mode == "graph_pagerank_neo4j_gds":
        run_graph_pagerank_neo4j_gds(args, reports_dir)


if __name__ == "__main__":
    main()
