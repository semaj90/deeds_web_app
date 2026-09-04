#!/usr/bin/env python3
"""Read-only Neo4j concept graph -> deterministic NetworkX node-link JSON.

Neo4j remains a derived graph projection.  This script is intentionally a
bounded export adapter for DAG/LangExtract consumers; it does not promote
concepts, write Neo4j/Postgres/Valkey, or include embeddings, tensors, or
model hidden state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any

import networkx as nx
from neo4j import GraphDatabase


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "docs" / "reports" / "neo4j-concept-networkx-export-v1.json"
CONCEPT_LABELS = frozenset({"Concept", "Ontology", "Domain"})
CONTEXT_LABELS = frozenset({"Packet", "Feature", "Trace", "SourceRef", "TreeNode"})


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "to_native"):
        return json_safe(value.to_native())
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def checksum(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def canonical_node_key(labels: list[str], props: dict[str, Any], element_id: str) -> tuple[str, str]:
    candidates = [
        props.get("concept_id"), props.get("conceptId"), props.get("ontology_id"),
        props.get("ontologyId"), props.get("domain_id"), props.get("domainId"),
        props.get("canonical_id"), props.get("canonicalId"), props.get("slug"),
    ]
    identity = next((str(value).strip() for value in candidates if str(value or "").strip()), None)
    if identity:
        prefix = "concept" if "Concept" in labels else "ontology" if "Ontology" in labels else "domain"
        return f"{prefix}:{identity}", "EXPLICIT_PROPERTY"
    return f"neo4j:{element_id}", "DEGRADED_ELEMENT_ID"


def context_node_key(labels: list[str], props: dict[str, Any], element_id: str) -> tuple[str, str]:
    identity = next((str(props.get(name)).strip() for name in
                     ("packet_key", "packetKey", "source_ref", "sourceRef", "feature_id", "featureId")
                     if str(props.get(name) or "").strip()), None)
    if identity:
        return f"source:{labels[0].lower()}:{identity}", "EXPLICIT_PROPERTY"
    return f"neo4j:{element_id}", "DEGRADED_ELEMENT_ID"


def revision_fields(props: dict[str, Any]) -> dict[str, Any]:
    """Copy only caller-supplied revisions; never derive synthetic ones."""
    return {
        "source_ref": props.get("source_ref", props.get("sourceRef")),
        "source_revision": props.get("source_revision", props.get("sourceRevision")),
        "workspace_revision": props.get("workspace_revision", props.get("workspaceRevision")),
        "content_hash": props.get("content_hash", props.get("contentHash")),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--max-nodes", type=int, default=25000)
    parser.add_argument("--max-edges", type=int, default=100000)
    args = parser.parse_args()

    uri = os.environ.get("NEO4J_URI", "bolt://127.0.0.1:7687")
    user = os.environ.get("NEO4J_USER", os.environ.get("NEO4J_USERNAME", "neo4j"))
    password = os.environ.get("NEO4J_PASSWORD", "neo4j123")
    graph = nx.MultiDiGraph()
    node_identity_modes: dict[str, int] = {}
    element_to_key: dict[str, str] = {}

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        with driver.session() as session:
            node_records = session.execute_read(
                lambda tx: tx.run(
                    """
                    MATCH (n)
                    WHERE any(label IN labels(n) WHERE label IN $labels)
                    RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS props
                    ORDER BY elementId(n)
                    LIMIT $limit
                    """,
                    labels=sorted(CONCEPT_LABELS),
                    limit=max(1, min(args.max_nodes, 100000)),
                ).data()
            )
            for row in node_records:
                labels = sorted(str(label) for label in row.get("labels", []))
                props = json_safe(row.get("props") or {})
                key, identity_mode = canonical_node_key(labels, props, str(row["elementId"]))
                if key in graph:
                    key = f"{key}:{row['elementId']}"
                    identity_mode = "DUPLICATE_EXPLICIT_PROPERTY_DEGRADED"
                graph.add_node(
                    key,
                    node_kind="CONCEPT" if "Concept" in labels else "ONTOLOGY" if "Ontology" in labels else "DOMAIN",
                    labels=labels,
                    # Keep only stable, non-sensitive descriptive properties.
                    canonical_label=props.get("canonical_label", props.get("canonicalLabel", props.get("name"))),
                    namespace=props.get("namespace"),
                    concept_type=props.get("concept_type", props.get("conceptType")),
                    description=props.get("description"),
                    identity_mode=identity_mode,
                    **revision_fields(props),
                )
                element_to_key[str(row["elementId"])] = key
                node_identity_modes[identity_mode] = node_identity_modes.get(identity_mode, 0) + 1

            edge_records = session.execute_read(
                lambda tx: tx.run(
                    """
                    MATCH (a)-[r]->(b)
                    WHERE (any(label IN labels(a) WHERE label IN $conceptLabels)
                           AND any(label IN labels(b) WHERE label IN $allowedLabels))
                       OR (any(label IN labels(b) WHERE label IN $conceptLabels)
                           AND any(label IN labels(a) WHERE label IN $allowedLabels))
                    RETURN elementId(a) AS sourceElementId, labels(a) AS sourceLabels,
                           properties(a) AS sourceProps,
                           elementId(b) AS targetElementId,
                           labels(b) AS targetLabels, properties(b) AS targetProps,
                           type(r) AS relationType
                    ORDER BY relationType, sourceElementId, targetElementId
                    LIMIT $limit
                    """,
                    conceptLabels=sorted(CONCEPT_LABELS),
                    allowedLabels=sorted(CONCEPT_LABELS | CONTEXT_LABELS),
                    limit=max(1, min(args.max_edges, 200000)),
                ).data()
            )
            for row in edge_records:
                for side in ("source", "target"):
                    element_id = str(row[f"{side}ElementId"])
                    if element_id in element_to_key:
                        continue
                    labels = sorted(str(label) for label in row.get(f"{side}Labels", []))
                    props = json_safe(row.get(f"{side}Props") or {})
                    key, identity_mode = (canonical_node_key(labels, props, element_id)
                                          if set(labels) & CONCEPT_LABELS
                                          else context_node_key(labels, props, element_id))
                    if key not in graph:
                        graph.add_node(key, node_kind="CONTEXT", labels=labels,
                                      canonical_label=props.get("name"), namespace=None,
                                      concept_type=None, description=None, identity_mode=identity_mode,
                                      **revision_fields(props))
                    element_to_key[element_id] = key
                    node_identity_modes[identity_mode] = node_identity_modes.get(identity_mode, 0) + 1
                source = element_to_key.get(str(row["sourceElementId"]))
                target = element_to_key.get(str(row["targetElementId"]))
                if source and target:
                    graph.add_edge(source, target, relation_type=str(row["relationType"]))
    finally:
        driver.close()

    nodes = [
        {"id": node, **{k: json_safe(v) for k, v in attrs.items()}}
        for node, attrs in sorted(graph.nodes(data=True), key=lambda item: item[0])
    ]
    edges = [
        {"source": source, "target": target, **{k: json_safe(v) for k, v in attrs.items()}}
        for source, target, _key, attrs in sorted(
            graph.edges(keys=True, data=True), key=lambda item: (item[0], item[1], item[3].get("relation_type", ""))
        )
    ]
    graph_payload = {"directed": True, "multigraph": True, "nodes": nodes, "links": edges}
    graph_revision = checksum({"nodes": nodes, "links": edges})
    report = {
        "schema": "atlas.neo4j-concept-networkx-export.v1",
        "generatedAt": datetime.now().astimezone().isoformat(),
        "source": {"kind": "NEO4J_READ_ONLY", "uri": uri,
                   "conceptLabels": sorted(CONCEPT_LABELS), "contextLabels": sorted(CONTEXT_LABELS)},
        "graphRevision": graph_revision,
        "projectionChecksum": checksum(graph_payload),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "nodeIdentityModes": node_identity_modes,
        "revisionCoverage": {
            "nodesWithSourceRevision": sum(bool(node.get("source_revision")) for node in nodes),
            "nodesWithWorkspaceRevision": sum(bool(node.get("workspace_revision")) for node in nodes),
            "edgesWithSourceRevision": sum(bool(edge.get("source_revision")) for edge in edges),
            "edgesWithWorkspaceRevision": sum(bool(edge.get("workspace_revision")) for edge in edges),
        },
        "networkx": {"version": nx.__version__, "format": "node_link_data"},
        "downstream": {"langextract": "bounded_observation_consumer", "ornith": "bounded_synthesis_consumer"},
        "canonicalAuthority": False,
        "writesPerformed": False,
        "containsEmbeddings": False,
        "containsTensors": False,
        "graph": graph_payload,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": report["schema"],
        "graphRevision": report["graphRevision"],
        "nodeCount": report["nodeCount"],
        "edgeCount": report["edgeCount"],
        "projectionChecksum": report["projectionChecksum"],
        "canonicalAuthority": report["canonicalAuthority"],
        "writesPerformed": report["writesPerformed"],
        "output": str(output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
