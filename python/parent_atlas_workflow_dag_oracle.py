#!/usr/bin/env python3
"""NetworkX reference oracle for Parent Atlas workflow DAG admission.

This oracle validates the *execution/workflow* graph, not the authority graph.
Authority/code graphs may contain cycles; workflow plans may not. Retries are
represented as new forward-only nodes (VERIFY_0 -> REPAIR_1 -> VERIFY_1).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    import networkx as nx
except ImportError as error:
    print(json.dumps({"status": "NETWORKX_UNAVAILABLE", "reason": str(error)}))
    raise SystemExit(2)


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_json(value: object) -> str:
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()


def nonnegative_number(value: Any, name: str) -> float:
    number = float(value or 0)
    if number < 0:
        raise ValueError(f"{name} must be >= 0")
    return number


def normalize_node(raw: dict[str, Any]) -> dict[str, Any]:
    node_id = str(raw.get("id", "")).strip()
    if not node_id:
        raise ValueError("workflow node id is required")

    dependencies = [str(dep).strip() for dep in raw.get("dependencies", [])]
    if any(not dep for dep in dependencies):
        raise ValueError(f"node {node_id}: dependency ids must be non-empty")
    if len(set(dependencies)) != len(dependencies):
        raise ValueError(f"node {node_id}: duplicate dependencies are not allowed")
    if node_id in dependencies:
        raise ValueError(f"node {node_id}: self dependency is not allowed")

    cost = raw.get("cost") or {}
    return {
        "id": node_id,
        "dependencies": sorted(dependencies),
        "kind": str(raw.get("kind", "task")),
        "logicalActionId": raw.get("logicalActionId"),
        "attempt": int(raw.get("attempt", 0)),
        "cost": {
            "compute": nonnegative_number(cost.get("compute", 0), "compute"),
            "toolCalls": nonnegative_number(cost.get("toolCalls", 0), "toolCalls"),
            "contextTokens": nonnegative_number(cost.get("contextTokens", 0), "contextTokens"),
            "gpuBytes": nonnegative_number(cost.get("gpuBytes", 0), "gpuBytes"),
            "elapsedMs": nonnegative_number(cost.get("elapsedMs", 0), "elapsedMs"),
        },
    }


def normalize_budget(raw: dict[str, Any]) -> dict[str, float]:
    required = (
        "maxNodes",
        "maxEdges",
        "maxDepth",
        "maxWidth",
        "maxCompute",
        "maxToolCalls",
        "maxContextTokens",
        "maxGpuBytes",
        "maxElapsedMs",
    )
    missing = [key for key in required if key not in raw]
    if missing:
        raise ValueError(f"workflow budget missing fields: {', '.join(missing)}")
    return {key: nonnegative_number(raw[key], key) for key in required}


def evaluate(plan: dict[str, Any]) -> dict[str, Any]:
    if plan.get("schema") != "atlas.workflow-dag-plan.v1":
        raise ValueError("schema must be atlas.workflow-dag-plan.v1")

    nodes = [normalize_node(raw) for raw in plan.get("nodes", [])]
    ids = [node["id"] for node in nodes]
    if len(ids) != len(set(ids)):
        raise ValueError("workflow node ids must be unique")

    by_id = {node["id"]: node for node in nodes}
    missing_dependencies = sorted(
        {
            dep
            for node in nodes
            for dep in node["dependencies"]
            if dep not in by_id
        }
    )

    graph = nx.DiGraph()
    graph.add_nodes_from(ids)
    for node in nodes:
        for dep in node["dependencies"]:
            if dep in by_id:
                graph.add_edge(dep, node["id"])

    is_dag = not missing_dependencies and nx.is_directed_acyclic_graph(graph)
    topological_order: list[str] = []
    generations: list[list[str]] = []
    cycle_edges: list[list[str]] = []

    if is_dag:
        topological_order = list(nx.lexicographical_topological_sort(graph, key=str))
        generations = [sorted(generation) for generation in nx.topological_generations(graph)]
        depth = (nx.dag_longest_path_length(graph) + 1) if graph.number_of_nodes() else 0
    else:
        depth = 0
        if not missing_dependencies:
            try:
                cycle_edges = [list(edge[:2]) for edge in nx.find_cycle(graph, orientation="original")]
            except nx.NetworkXNoCycle:
                cycle_edges = []

    width = max((len(generation) for generation in generations), default=0)
    budget = normalize_budget(plan.get("budget") or {})

    totals = {
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "depth": depth,
        "width": width,
        "compute": sum(node["cost"]["compute"] for node in nodes),
        "toolCalls": sum(node["cost"]["toolCalls"] for node in nodes),
        "contextTokens": sum(node["cost"]["contextTokens"] for node in nodes),
        "gpuBytes": sum(node["cost"]["gpuBytes"] for node in nodes),
        "elapsedMs": sum(node["cost"]["elapsedMs"] for node in nodes),
    }

    comparisons = {
        "nodes": "maxNodes",
        "edges": "maxEdges",
        "depth": "maxDepth",
        "width": "maxWidth",
        "compute": "maxCompute",
        "toolCalls": "maxToolCalls",
        "contextTokens": "maxContextTokens",
        "gpuBytes": "maxGpuBytes",
        "elapsedMs": "maxElapsedMs",
    }
    violations: list[str] = []
    if missing_dependencies:
        violations.append("missing_dependencies")
    if not is_dag:
        violations.append("cycle_or_invalid_dependency_graph")
    for metric, budget_key in comparisons.items():
        if totals[metric] > budget[budget_key]:
            violations.append(f"{metric}_budget_exceeded")

    retry_lineage: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        logical = node.get("logicalActionId")
        if not logical:
            continue
        retry_lineage.setdefault(str(logical), []).append(
            {"id": node["id"], "attempt": node["attempt"], "kind": node["kind"]}
        )
    for logical in retry_lineage:
        retry_lineage[logical].sort(key=lambda item: (item["attempt"], item["id"]))

    normalized_plan = {
        "schema": plan["schema"],
        "workflowRevision": int(plan.get("workflowRevision", 0)),
        "nodes": sorted(nodes, key=lambda node: node["id"]),
        "budget": budget,
    }
    plan_hash = sha256_json(normalized_plan)
    receipt_payload = {
        "schema": "atlas.workflow-dag-receipt.v1",
        "workflowRevision": normalized_plan["workflowRevision"],
        "planHash": plan_hash,
        "referenceEngine": "networkx",
        "executorRole": "REFERENCE_ORACLE",
        "isDag": is_dag,
        "admissible": is_dag and not violations,
        "topologicalOrder": topological_order,
        "generations": generations,
        "metrics": totals,
        "budget": budget,
        "missingDependencies": missing_dependencies,
        "cycleEdges": cycle_edges,
        "violations": violations,
        "retryLineage": retry_lineage,
    }
    receipt_payload["receiptHash"] = sha256_json(receipt_payload)
    return receipt_payload


def load_plan(path: Path | None) -> dict[str, Any]:
    if path is None:
        return json.load(sys.stdin)
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, help="WorkflowDagPlanV1 JSON; defaults to stdin")
    args = parser.parse_args()
    try:
        receipt = evaluate(load_plan(args.input))
    except Exception as error:
        print(json.dumps({"status": "WORKFLOW_DAG_INVALID_INPUT", "reason": str(error)}, sort_keys=True))
        return 2

    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["admissible"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
