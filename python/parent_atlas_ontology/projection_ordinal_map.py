"""OAK-PROJECTION-01 (Python side): mirrors
packages/parent-atlas/src/core/projection-ordinal-map-v1.ts field-for-
field, same determinism convention (sort by projectionNodeKey, assign
dense ordinals), so a TS-built and a Python-built map over the same
logical node set produce byte-identical ordinal assignments and the same
checksum algorithm's output is comparable.

Migrates the Python NetworkX adapter (networkx_snapshot.py, built on the
shared atlas_semantic_ontology_projection.py substrate) onto this ONE
query-graph coordinate space — replacing the ad-hoc `relation:{id}`/
`ordinal:{N}` node labels graph_projection.py used (superseded) and the
raw sorted-node-id ordinals networkx_snapshot.py's own
`_canonical_graph_payload` self-assigns internally, with the same
canonical ProjectionOrdinalMapV1 shape the TS side now has.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Sequence

PROJECTION_NODE_CLASS_VALUES = ("ENTITY", "TUPLE", "HYPEREDGE", "TOOL", "EVIDENCE")

_PREFIX_BY_CLASS = {
    "ENTITY": "entity",
    "TUPLE": "tuple",
    "HYPEREDGE": "hyperedge",
    "TOOL": "tool",
    "EVIDENCE": "evidence",
}


class ProjectionOrdinalMapValidationError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ProjectionOrdinalRowV1:
    projectionOrdinal: int
    projectionNodeKey: str
    nodeClass: str
    graphOrdinal: int | None = None
    graphNodeKey: str | None = None
    tupleId: str | None = None
    hyperedgeId: str | None = None

    def to_dict(self) -> dict:
        d = {"projectionOrdinal": self.projectionOrdinal, "projectionNodeKey": self.projectionNodeKey, "nodeClass": self.nodeClass}
        if self.graphOrdinal is not None:
            d["graphOrdinal"] = self.graphOrdinal
        if self.graphNodeKey is not None:
            d["graphNodeKey"] = self.graphNodeKey
        if self.tupleId is not None:
            d["tupleId"] = self.tupleId
        if self.hyperedgeId is not None:
            d["hyperedgeId"] = self.hyperedgeId
        return d


@dataclass(frozen=True, slots=True)
class ProjectionOrdinalMapV1:
    graphRevision: str
    ontologyRevision: str
    projectionRevision: str
    rows: tuple[ProjectionOrdinalRowV1, ...]
    projectionOrdinalMapChecksum: str
    schema: str = "atlas.projection-ordinal-map.v1"
    canonicalAuthority: bool = False

    def to_dict(self) -> dict:
        return {
            "schema": self.schema,
            "graphRevision": self.graphRevision,
            "ontologyRevision": self.ontologyRevision,
            "projectionRevision": self.projectionRevision,
            "rows": [r.to_dict() for r in self.rows],
            "projectionOrdinalMapChecksum": self.projectionOrdinalMapChecksum,
            "canonicalAuthority": self.canonicalAuthority,
        }


def _stable_json(value: Any) -> str:
    if isinstance(value, dict):
        return "{" + ",".join(f"{json.dumps(k)}:{_stable_json(value[k])}" for k in sorted(value.keys())) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_stable_json(v) for v in value) + "]"
    return json.dumps(value)


def _sha256(value: Any) -> str:
    return hashlib.sha256(_stable_json(value).encode("utf-8")).hexdigest()


def build_projection_ordinal_map_v1(
    *,
    graph_revision: str,
    ontology_revision: str,
    projection_revision: str,
    nodes: Sequence[dict],
) -> ProjectionOrdinalMapV1:
    """`nodes` items: {projectionNodeKey, nodeClass, graphOrdinal?,
    graphNodeKey?, tupleId?, hyperedgeId?} — same shape as the TS
    builder's `ProjectionNodeInputV1`, same validation rules."""
    if not graph_revision.strip() or not ontology_revision.strip() or not projection_revision.strip():
        raise ProjectionOrdinalMapValidationError("PROJECTION_ORDINAL_REVISION_BINDING_REQUIRED")

    seen: set[str] = set()
    for node in nodes:
        key = node["projectionNodeKey"]
        if key in seen:
            raise ProjectionOrdinalMapValidationError(f"PROJECTION_ORDINAL_DUPLICATE_NODE_KEY:{key}")
        seen.add(key)
        node_class = node["nodeClass"]
        if node_class not in PROJECTION_NODE_CLASS_VALUES:
            raise ProjectionOrdinalMapValidationError(f"unknown nodeClass {node_class!r}")
        expected_prefix = _PREFIX_BY_CLASS[node_class]
        if not key.startswith(f"{expected_prefix}:"):
            raise ProjectionOrdinalMapValidationError(f"nodeClass {node_class} requires a '{expected_prefix}:' prefixed projectionNodeKey, got {key!r}")
        if node_class == "TUPLE" and not node.get("tupleId"):
            raise ProjectionOrdinalMapValidationError(f"nodeClass TUPLE requires tupleId ({key})")
        if node_class == "HYPEREDGE" and not node.get("hyperedgeId"):
            raise ProjectionOrdinalMapValidationError(f"nodeClass HYPEREDGE requires hyperedgeId ({key})")
        has_ordinal = node.get("graphOrdinal") is not None
        has_key = node.get("graphNodeKey") is not None
        if has_ordinal != has_key:
            raise ProjectionOrdinalMapValidationError(f"graphOrdinal and graphNodeKey must be supplied together or not at all ({key})")
        if node_class != "ENTITY" and has_key:
            raise ProjectionOrdinalMapValidationError(f"nodeClass {node_class} has no durable graph identity ({key})")

    sorted_nodes = sorted(nodes, key=lambda n: n["projectionNodeKey"])
    rows = tuple(
        ProjectionOrdinalRowV1(
            projectionOrdinal=i,
            projectionNodeKey=node["projectionNodeKey"],
            nodeClass=node["nodeClass"],
            graphOrdinal=node.get("graphOrdinal"),
            graphNodeKey=node.get("graphNodeKey"),
            tupleId=node.get("tupleId"),
            hyperedgeId=node.get("hyperedgeId"),
        )
        for i, node in enumerate(sorted_nodes)
    )
    body = {
        "schema": "atlas.projection-ordinal-map.v1",
        "graphRevision": graph_revision,
        "ontologyRevision": ontology_revision,
        "projectionRevision": projection_revision,
        "rows": [r.to_dict() for r in rows],
        "canonicalAuthority": False,
    }
    return ProjectionOrdinalMapV1(
        graphRevision=graph_revision,
        ontologyRevision=ontology_revision,
        projectionRevision=projection_revision,
        rows=rows,
        projectionOrdinalMapChecksum=_sha256(body),
    )


# NetworkX snapshot node_kind -> ProjectionNodeClass. LITERAL_ASSERTION is
# deliberately NOT mapped (no honest fit among the 5 classes) — nodes of
# that kind are skipped, not force-fit, matching this package's existing
# skip-and-report discipline (see graph_projection.py's skippedParticipants).
_NODE_KIND_TO_CLASS = {"ENTITY": "ENTITY", "NARY_RELATION": "TUPLE"}


def projection_ordinal_map_from_networkx_snapshot(
    snapshot: dict,
    *,
    ontology_revision: str,
    projection_revision: str,
) -> tuple[ProjectionOrdinalMapV1, tuple[dict, ...]]:
    """Converts a `networkx_snapshot.build_networkx_snapshot()` payload's
    nodes into a `ProjectionOrdinalMapV1`. Returns (map, skipped) — skipped
    entries are LITERAL_ASSERTION nodes, reported not silently dropped."""
    nodes: list[dict] = []
    skipped: list[dict] = []
    for row in snapshot["nodes"]:
        node_kind = row["attributes"].get("node_kind")
        node_class = _NODE_KIND_TO_CLASS.get(node_kind)
        if node_class is None:
            skipped.append({"node_id": row["node_id"], "node_kind": node_kind, "reason": "no honest ProjectionNodeClass mapping for this node_kind"})
            continue
        prefix = _PREFIX_BY_CLASS[node_class]
        entry: dict = {"projectionNodeKey": f"{prefix}:{row['node_id']}", "nodeClass": node_class}
        if node_class == "TUPLE":
            entry["tupleId"] = row["attributes"].get("relationship_id") or row["node_id"].removeprefix("relation:")
        nodes.append(entry)

    projection_map = build_projection_ordinal_map_v1(
        graph_revision=snapshot["graph_revision"],
        ontology_revision=ontology_revision,
        projection_revision=projection_revision,
        nodes=nodes,
    )
    return projection_map, tuple(skipped)
