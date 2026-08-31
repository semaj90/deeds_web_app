"""ONTO-PY-04 (SUPERSEDED as the adapter's default path, 2026-08-31 —
kept on disk, still real and tested, not deleted): a genuine duplication
was found between this module and the independently-built
`atlas_semantic_ontology_projection.py` (a more general
SemanticAssertion/NarySemanticRelation substrate that does the same
"relation node, never pairwise cliques" projection, plus RDFLib/
PageRank/OWL-RL/SHACL). The operator's decision: layer
`OntologyLinkedTupleV1` on top of that shared substrate via
`semantic_bridge.py`, rather than keep two independent NetworkX
projection implementations. `OntologyLinkedTupleAdapter.to_graph_projection()`
now delegates there instead of calling `project_to_graph()` below.

This module is kept because (a) it's real, tested, and still correct for
its own narrower contract (an externally-supplied `ordinal_map` bound to
a real `GraphOrdinalMapV1`, rather than the shared substrate's
self-assigned dense ordinals), and (b) it surfaced a genuine, still-
unresolved finding worth keeping on record — see below. Do not delete
without checking `onto_py_04_graph_projection_check.py`, which still
exercises this module directly and passes.

--- Original docstring follows ---

ONTO-PY-04: OntologyLinkedTupleV1 -> NetworkX n-ary relation-node
projection.

Design, per the operator: for an n-ary relation, project a RELATION NODE
connected to each participant (participant A/B/C/D -> R17 <-), never
pairwise edges between every participant pair. Pairwise-edge
manufacturing would silently lose the tuple's own identity and each
participant's distinct role - the exact failure mode this file exists to
avoid.

Real gap found while designing this (checked directly, not guessed at):
the canonical `GraphNodeKeyV1` regex at
sveltekit-frontend/src/lib/server/atlas/graph/graph-node-key-v1.ts is
`^(symbol|packet|chunk|occurrence):.+$` - there is no `relation:` prefix.
A relation node therefore CANNOT be assigned a real, canonical
`GraphNodeKeyV1` today, which means it cannot appear as a row in a real
`GraphOrdinalMapV1` either. This module does not invent one. Instead:

- `ordinal_map` (participant-node ordinals) is an opaque, EXTERNALLY
  SUPPLIED `dict[str, int]` keyed by whatever identity string the caller
  already resolved to a real ordinal (e.g. from a real
  `GraphOrdinalMapV1`'s rows) - this module never derives
  entityKind -> GraphNodeKeyV1 mappings itself, which would mean
  guessing at identity resolution that belongs on the TS/Postgres side.
- Relation nodes get their OWN separate, LOCAL, non-canonical ordinal
  space (dense, assigned by sorted tupleId, matching the same "sort then
  assign dense integers" determinism as the real `buildGraphOrdinalMapV1`
  uses for participant ordinals) - clearly documented as executor-local
  and non-canonical, per the operator's own "GraphOrdinal is still
  executor-local; the ontology tuple remains the canonical external
  relation reference" rule.
- Participants whose entityId is not in the supplied `ordinal_map` are
  SKIPPED (not crashed on, not fabricated an ordinal for) and reported
  in the result's `skippedParticipants` list - a real production tuple
  can legitimately reference a participant kind that has no graph-node
  presence yet (e.g. `tool_call` in the ONTO-PY-01 fixture).

Before this can be treated as more than a partial projection: TS-side
`graph-node-key-v1.ts` needs a `relation:` prefix (or an equivalent
decision) before relation nodes can be canonical `GraphOrdinalMapV1`
rows - that decision is out of scope for this Python-only pass and
belongs with whoever owns that TS file.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Sequence

import networkx as nx

from parent_atlas_ontology.enums import PARTICIPANT_ROLE_VALUES
from parent_atlas_ontology.models import OntologyLinkedTupleV1

# Deterministic role -> int encoding, sorted so it never depends on
# dict/set iteration order across Python versions or runs.
ROLE_CODE_BY_NAME: dict[str, int] = {role: i for i, role in enumerate(sorted(PARTICIPANT_ROLE_VALUES))}


@dataclass(frozen=True, slots=True)
class ProjectionNodeKeyV1:
    """Executor-local key for operational graph vertices.

    This is deliberately separate from durable GraphNodeKeyV1.  Tuple and
    tool/evidence vertices can participate in a query graph without being
    promoted to canonical Parent Atlas graph identity.
    """

    key: str
    nodeClass: str
    entityId: str | None = None
    tupleId: str | None = None


@dataclass(frozen=True, slots=True)
class OperationalGraphEdgeV1:
    """One coordinate universe for NetworkX/cuGraph operational edges."""

    sourceProjectionOrdinal: int
    destinationProjectionOrdinal: int
    edgeId: str
    edgeType: str
    roleCode: int
    tupleId: str


@dataclass(frozen=True, slots=True)
class GraphEdgeProjectionV1:
    """The compact GPU-facing ABI the operator specified. `relationOrdinal`
    is explicitly the LOCAL, non-canonical relation-node ordinal space
    described in this module's docstring, not a real GraphOrdinalMapV1 row."""

    sourceOrdinal: int
    destinationOrdinal: int
    relationOrdinal: int
    roleCode: int


@dataclass(frozen=True, slots=True)
class GraphProjectionResultV1:
    graph: "nx.MultiDiGraph"
    edges: tuple[GraphEdgeProjectionV1, ...]
    relationOrdinalByTupleId: dict[str, int]
    skippedParticipants: tuple[dict, ...]
    projectionChecksum: str
    projectionNodes: tuple[ProjectionNodeKeyV1, ...] = ()
    projectionOrdinalByNodeKey: dict[str, int] | None = None
    operationalEdges: tuple[OperationalGraphEdgeV1, ...] = ()


def _stable_json(value) -> str:
    import json

    if isinstance(value, dict):
        return "{" + ",".join(f"{json.dumps(k)}:{_stable_json(value[k])}" for k in sorted(value.keys())) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_stable_json(v) for v in value) + "]"
    return json.dumps(value)


def project_to_graph(
    tuples: Sequence[OntologyLinkedTupleV1],
    ordinal_map: dict[str, int],
) -> GraphProjectionResultV1:
    """Projects each tuple as one relation node connected to every
    ordinal-resolvable participant - never pairwise edges between
    participants. `ordinal_map` is opaque and externally supplied (see
    module docstring); this function does not derive it."""
    graph: "nx.MultiDiGraph" = nx.MultiDiGraph()

    # Relation ordinals: dense, sorted-by-tupleId, local, non-canonical.
    sorted_tuple_ids = sorted({t.tupleId for t in tuples})
    relation_ordinal_by_tuple_id = {tuple_id: i for i, tuple_id in enumerate(sorted_tuple_ids)}

    edges: list[GraphEdgeProjectionV1] = []
    projection_node_keys: dict[str, ProjectionNodeKeyV1] = {}
    operational_edges: list[OperationalGraphEdgeV1] = []
    skipped: list[dict] = []

    for t in tuples:
        relation_ordinal = relation_ordinal_by_tuple_id[t.tupleId]
        relation_node_label = f"relation:{t.tupleId}"
        projection_node_keys[relation_node_label] = ProjectionNodeKeyV1(
            key=relation_node_label, nodeClass="TUPLE", tupleId=t.tupleId
        )
        graph.add_node(relation_node_label, kind="relation", tupleId=t.tupleId, relationOrdinal=relation_ordinal)

        for participant in t.participants:
            participant_ordinal = ordinal_map.get(participant.entityId)
            if participant_ordinal is None:
                skipped.append({
                    "tupleId": t.tupleId,
                    "entityId": participant.entityId,
                    "entityKind": participant.entityKind,
                    "role": participant.role,
                    "reason": "entityId not present in supplied ordinal_map",
                })
                continue

            participant_node_label = f"ordinal:{participant_ordinal}"
            projection_node_keys[participant_node_label] = ProjectionNodeKeyV1(
                key=participant_node_label,
                nodeClass="ENTITY",
                entityId=participant.entityId,
            )
            graph.add_node(participant_node_label, kind="participant", entityId=participant.entityId, entityKind=participant.entityKind, ordinal=participant_ordinal)
            role_code = ROLE_CODE_BY_NAME[participant.role]
            graph.add_edge(
                relation_node_label,
                participant_node_label,
                role=participant.role,
                roleCode=role_code,
                tupleId=t.tupleId,
            )
            edges.append(GraphEdgeProjectionV1(
                sourceOrdinal=relation_ordinal,
                destinationOrdinal=participant_ordinal,
                relationOrdinal=relation_ordinal,
                roleCode=role_code,
            ))

    projection_nodes = tuple(sorted(projection_node_keys.values(), key=lambda node: node.key))
    projection_ordinal_by_node_key = {node.key: ordinal for ordinal, node in enumerate(projection_nodes)}
    for edge in edges:
        source_key = f"relation:{next(tid for tid, ordinal in relation_ordinal_by_tuple_id.items() if ordinal == edge.relationOrdinal)}"
        destination_key = f"ordinal:{edge.destinationOrdinal}"
        operational_edges.append(OperationalGraphEdgeV1(
            sourceProjectionOrdinal=projection_ordinal_by_node_key[source_key],
            destinationProjectionOrdinal=projection_ordinal_by_node_key[destination_key],
            edgeId=hashlib.sha256(
                _stable_json({
                    "tupleId": next(tid for tid, ordinal in relation_ordinal_by_tuple_id.items() if ordinal == edge.relationOrdinal),
                    "destinationOrdinal": edge.destinationOrdinal,
                    "roleCode": edge.roleCode,
                }).encode("utf-8")
            ).hexdigest(),
            edgeType="TUPLE_PARTICIPATION",
            roleCode=edge.roleCode,
            tupleId=next(tid for tid, ordinal in relation_ordinal_by_tuple_id.items() if ordinal == edge.relationOrdinal),
        ))

    edges_sorted = tuple(sorted(edges, key=lambda e: (e.relationOrdinal, e.destinationOrdinal, e.roleCode)))
    operational_edges_sorted = tuple(sorted(
        operational_edges,
        key=lambda e: (e.sourceProjectionOrdinal, e.destinationProjectionOrdinal, e.roleCode, e.edgeId),
    ))
    checksum_input = {
        "relationOrdinalByTupleId": relation_ordinal_by_tuple_id,
        "edges": [
            {"sourceOrdinal": e.sourceOrdinal, "destinationOrdinal": e.destinationOrdinal, "relationOrdinal": e.relationOrdinal, "roleCode": e.roleCode}
            for e in edges_sorted
        ],
    }
    projection_checksum = hashlib.sha256(_stable_json(checksum_input).encode("utf-8")).hexdigest()

    return GraphProjectionResultV1(
        graph=graph,
        edges=edges_sorted,
        relationOrdinalByTupleId=relation_ordinal_by_tuple_id,
        skippedParticipants=tuple(skipped),
        projectionChecksum=projection_checksum,
        projectionNodes=projection_nodes,
        projectionOrdinalByNodeKey=projection_ordinal_by_node_key,
        operationalEdges=operational_edges_sorted,
    )
