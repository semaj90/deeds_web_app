"""Provenance-preserving semantic ontology projections for Parent Atlas.

This module deliberately separates four concerns:

1. Atlas assertion / N-ary relation identity and source provenance.
2. RDFLib Dataset projection for semantic-web interchange and named-graph lineage.
3. NetworkX projection for derived graph analytics such as PageRank.
4. Optional OWL/SHACL reasoning and validation, whose outputs remain derived.

`source_ref` and `tree_node_id` are provenance coordinates, not ontology concepts.
NetworkX, RDFLib, OWL-RL, pySHACL and Owlready2 never become canonical identity
owners. Canonical promotion remains in the TypeScript Parent Atlas host.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from hashlib import sha256
import json
from typing import Any, Iterable, Literal, Mapping, Sequence
from urllib.parse import quote


Json = dict[str, Any]


def _stable(value: Any) -> str:
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    if hasattr(value, "__dataclass_fields__"):
        value = asdict(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def logical_checksum(value: Any) -> str:
    """Checksum logical content before JSON / MessagePack / byte encoding."""
    return sha256(_stable(value).encode("utf-8")).hexdigest()


def _require(value: str | None, name: str) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{name} is required")
    return str(value)


def _entity_urn(canonical_id: str) -> str:
    return f"urn:atlas:entity:{quote(canonical_id, safe='')}"


def _predicate_urn(predicate: str) -> str:
    return f"urn:atlas:predicate:{quote(predicate, safe='')}"


def _statement_urn(statement_id: str) -> str:
    return f"urn:atlas:statement:{quote(statement_id, safe='')}"


def _relation_urn(relation_id: str) -> str:
    return f"urn:atlas:relation:{quote(relation_id, safe='')}"


def _source_graph_urn(source_ref: str, source_revision: str) -> str:
    digest = logical_checksum({"source_ref": source_ref, "source_revision": source_revision})[:32]
    return f"urn:atlas:source-graph:{digest}"


@dataclass(frozen=True)
class SemanticAssertion:
    subject_id: str
    predicate: str
    object_value: str
    object_kind: Literal["ENTITY", "LITERAL"]
    source_ref: str
    source_revision: str
    observation_kind: Literal[
        "AST_FACT",
        "SCHEMA_FACT",
        "TEST_FACT",
        "RUNTIME_FACT",
        "EXTERNAL_DOC_FACT",
        "RULE_INFERENCE",
        "OWL_INFERENCE",
    ]
    tree_node_id: str | None = None
    packet_key: str | None = None
    relationship_id: str | None = None
    evidence_refs: tuple[str, ...] = tuple()
    domain_class: str | None = None
    confidence: float = 1.0
    producer_revision: str = "unknown"
    statement_id: str | None = None
    canonical_authority: bool = False

    def __post_init__(self) -> None:
        _require(self.subject_id, "subject_id")
        _require(self.predicate, "predicate")
        _require(self.object_value, "object_value")
        _require(self.source_ref, "source_ref")
        _require(self.source_revision, "source_revision")
        _require(self.producer_revision, "producer_revision")
        if self.observation_kind == "AST_FACT" and not self.tree_node_id:
            raise ValueError("AST_FACT requires tree_node_id")
        if not (0.0 <= float(self.confidence) <= 1.0):
            raise ValueError("confidence must be in [0,1]")
        if self.canonical_authority:
            raise ValueError("semantic ontology projections cannot claim canonical authority")
        if self.statement_id is None:
            object.__setattr__(self, "statement_id", logical_checksum({
                "subject_id": self.subject_id,
                "predicate": self.predicate,
                "object_value": self.object_value,
                "object_kind": self.object_kind,
                "source_ref": self.source_ref,
                "source_revision": self.source_revision,
                "observation_kind": self.observation_kind,
                "tree_node_id": self.tree_node_id,
                "packet_key": self.packet_key,
                "relationship_id": self.relationship_id,
                "evidence_refs": sorted(self.evidence_refs),
                "producer_revision": self.producer_revision,
            }))

    def to_dict(self) -> Json:
        return asdict(self)


@dataclass(frozen=True)
class RelationParticipant:
    canonical_id: str
    role: str
    ordinal: int
    source_ref: str | None = None
    tree_node_id: str | None = None

    def __post_init__(self) -> None:
        _require(self.canonical_id, "canonical_id")
        _require(self.role, "role")
        if self.ordinal < 0:
            raise ValueError("ordinal must be non-negative")


@dataclass(frozen=True)
class NarySemanticRelation:
    relation_id: str
    relation_type: str
    source_ref: str
    source_revision: str
    participants: tuple[RelationParticipant, ...]
    evidence_refs: tuple[str, ...] = tuple()
    domain_class: str | None = None
    producer_revision: str = "unknown"
    canonical_authority: bool = False

    def __post_init__(self) -> None:
        _require(self.relation_id, "relation_id")
        _require(self.relation_type, "relation_type")
        _require(self.source_ref, "source_ref")
        _require(self.source_revision, "source_revision")
        if len(self.participants) < 2:
            raise ValueError("N-ary relation requires at least two participants")
        ordinals = [item.ordinal for item in self.participants]
        if len(set(ordinals)) != len(ordinals):
            raise ValueError("participant ordinals must be unique")
        if self.canonical_authority:
            raise ValueError("semantic ontology projections cannot claim canonical authority")

    @property
    def degree(self) -> int:
        return len(self.participants)

    def to_dict(self) -> Json:
        value = asdict(self)
        value["degree"] = self.degree
        return value


@dataclass(frozen=True)
class SemanticFeatureRow:
    canonical_id: str
    feature_revision: str
    source_ref: str | None = None
    source_revision: str | None = None
    tree_node_id: str | None = None
    semantic_768_checksum: str | None = None
    pagerank: float | None = None
    ppr: float | None = None
    low_rank_sampling_weight: float | None = None
    polynomial_interaction_checksum: str | None = None
    bit_flags: int = 0
    canonical_authority: bool = False

    def __post_init__(self) -> None:
        _require(self.canonical_id, "canonical_id")
        _require(self.feature_revision, "feature_revision")
        if self.bit_flags < 0:
            raise ValueError("bit_flags must be non-negative")
        if self.canonical_authority:
            raise ValueError("feature rows are derived")

    def to_dict(self) -> Json:
        return asdict(self)


FEATURE_BITS: Mapping[str, int] = {
    "SOURCE_GROUNDED": 1 << 0,
    "AST_GROUNDED": 1 << 1,
    "NARY_MEMBER": 1 << 2,
    "SHACL_CONFORMANT": 1 << 3,
    "OWL_RL_INFERRED": 1 << 4,
    "OWL_DL_INFERRED": 1 << 5,
    "MUTATION_RELEVANT": 1 << 6,
    "EXACT_SEMANTIC_REFINED": 1 << 7,
}


def encode_feature_bits(labels: Iterable[str]) -> int:
    result = 0
    for label in labels:
        if label not in FEATURE_BITS:
            raise ValueError(f"unknown feature bit: {label}")
        result |= FEATURE_BITS[label]
    return result


def decode_feature_bits(value: int) -> tuple[str, ...]:
    if value < 0:
        raise ValueError("bit mask must be non-negative")
    return tuple(label for label, bit in FEATURE_BITS.items() if value & bit)


def build_rdflib_dataset(
    assertions: Sequence[SemanticAssertion],
    relations: Sequence[NarySemanticRelation] = tuple(),
):
    """Build an RDFLib Dataset with named-graph provenance and reified assertions.

    Source graphs preserve source_ref/source_revision boundaries. Reified
    statement nodes carry per-assertion tree_node_id/evidence metadata.
    N-ary facts are represented losslessly as relation + participation nodes,
    never as a canonical pairwise clique.
    """
    try:
        from rdflib import Dataset, Literal, Namespace, RDF, URIRef
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("rdflib is required for RDF projection") from exc

    ATLAS = Namespace("urn:atlas:vocab:")
    dataset = Dataset()

    def add_provenance(graph, subject, source_ref: str, source_revision: str, tree_node_id: str | None, evidence_refs: Sequence[str]):
        graph.add((subject, ATLAS.sourceRef, Literal(source_ref)))
        graph.add((subject, ATLAS.sourceRevision, Literal(source_revision)))
        if tree_node_id:
            graph.add((subject, ATLAS.treeNodeId, Literal(tree_node_id)))
        for evidence_ref in sorted(set(evidence_refs)):
            graph.add((subject, ATLAS.evidenceRef, Literal(evidence_ref)))

    for assertion in assertions:
        graph = dataset.graph(URIRef(_source_graph_urn(assertion.source_ref, assertion.source_revision)))
        subject = URIRef(_entity_urn(assertion.subject_id))
        predicate = URIRef(_predicate_urn(assertion.predicate))
        obj = URIRef(_entity_urn(assertion.object_value)) if assertion.object_kind == "ENTITY" else Literal(assertion.object_value)
        graph.add((subject, predicate, obj))
        graph.add((subject, ATLAS.canonicalId, Literal(assertion.subject_id)))

        statement = URIRef(_statement_urn(assertion.statement_id or ""))
        graph.add((statement, RDF.type, RDF.Statement))
        graph.add((statement, RDF.subject, subject))
        graph.add((statement, RDF.predicate, predicate))
        graph.add((statement, RDF.object, obj))
        graph.add((statement, ATLAS.statementId, Literal(assertion.statement_id)))
        graph.add((statement, ATLAS.observationKind, Literal(assertion.observation_kind)))
        graph.add((statement, ATLAS.confidence, Literal(float(assertion.confidence))))
        graph.add((statement, ATLAS.producerRevision, Literal(assertion.producer_revision)))
        if assertion.packet_key:
            graph.add((statement, ATLAS.packetKey, Literal(assertion.packet_key)))
        if assertion.relationship_id:
            graph.add((statement, ATLAS.relationshipId, Literal(assertion.relationship_id)))
        if assertion.domain_class:
            graph.add((statement, ATLAS.domainClass, Literal(assertion.domain_class)))
        add_provenance(
            graph,
            statement,
            assertion.source_ref,
            assertion.source_revision,
            assertion.tree_node_id,
            assertion.evidence_refs,
        )

    for relation in relations:
        graph = dataset.graph(URIRef(_source_graph_urn(relation.source_ref, relation.source_revision)))
        relation_node = URIRef(_relation_urn(relation.relation_id))
        graph.add((relation_node, RDF.type, ATLAS.NaryRelation))
        graph.add((relation_node, ATLAS.relationshipId, Literal(relation.relation_id)))
        graph.add((relation_node, ATLAS.relationType, Literal(relation.relation_type)))
        graph.add((relation_node, ATLAS.degree, Literal(relation.degree)))
        graph.add((relation_node, ATLAS.producerRevision, Literal(relation.producer_revision)))
        if relation.domain_class:
            graph.add((relation_node, ATLAS.domainClass, Literal(relation.domain_class)))
        add_provenance(graph, relation_node, relation.source_ref, relation.source_revision, None, relation.evidence_refs)

        for participant in sorted(relation.participants, key=lambda item: item.ordinal):
            participant_node = URIRef(
                f"urn:atlas:participation:{quote(relation.relation_id, safe='')}:{participant.ordinal}"
            )
            entity = URIRef(_entity_urn(participant.canonical_id))
            graph.add((participant_node, RDF.type, ATLAS.Participation))
            graph.add((participant_node, ATLAS.inRelation, relation_node))
            graph.add((participant_node, ATLAS.participantEntity, entity))
            graph.add((participant_node, ATLAS.participantRole, Literal(participant.role)))
            graph.add((participant_node, ATLAS.participantOrdinal, Literal(participant.ordinal)))
            graph.add((entity, ATLAS.canonicalId, Literal(participant.canonical_id)))
            if participant.source_ref:
                graph.add((participant_node, ATLAS.sourceRef, Literal(participant.source_ref)))
            if participant.tree_node_id:
                graph.add((participant_node, ATLAS.treeNodeId, Literal(participant.tree_node_id)))

    return dataset


def rdflib_provenance_rows(dataset) -> tuple[Json, ...]:
    """Extract reified assertion provenance rows without SPARQL dependency."""
    try:
        from rdflib import Namespace, RDF
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("rdflib is required") from exc

    ATLAS = Namespace("urn:atlas:vocab:")
    rows: list[Json] = []
    for graph in dataset.graphs():
        for statement in graph.subjects(RDF.type, RDF.Statement):
            source_ref = next(graph.objects(statement, ATLAS.sourceRef), None)
            source_revision = next(graph.objects(statement, ATLAS.sourceRevision), None)
            tree_node_id = next(graph.objects(statement, ATLAS.treeNodeId), None)
            statement_id = next(graph.objects(statement, ATLAS.statementId), None)
            rows.append({
                "graph": str(graph.identifier),
                "statement_id": str(statement_id) if statement_id is not None else None,
                "source_ref": str(source_ref) if source_ref is not None else None,
                "source_revision": str(source_revision) if source_revision is not None else None,
                "tree_node_id": str(tree_node_id) if tree_node_id is not None else None,
            })
    return tuple(sorted(rows, key=lambda row: str(row["statement_id"])))


def build_networkx_projection(
    assertions: Sequence[SemanticAssertion],
    relations: Sequence[NarySemanticRelation] = tuple(),
):
    """Create a lossless-enough analytics projection using MultiDiGraph.

    Each binary assertion becomes a keyed edge carrying provenance. Each N-ary
    relation becomes a relation node with role-bearing incidence edges. Pairwise
    hyperedge expansion is deliberately avoided.
    """
    try:
        import networkx as nx
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("networkx is required for analytics projection") from exc

    graph = nx.MultiDiGraph(kind="ATLAS_SEMANTIC_ANALYTICS_V1", canonical_authority=False)
    for assertion in assertions:
        graph.add_node(assertion.subject_id, node_kind="ENTITY")
        if assertion.object_kind == "ENTITY":
            graph.add_node(assertion.object_value, node_kind="ENTITY")
            graph.add_edge(
                assertion.subject_id,
                assertion.object_value,
                key=assertion.statement_id,
                statement_id=assertion.statement_id,
                predicate=assertion.predicate,
                source_ref=assertion.source_ref,
                source_revision=assertion.source_revision,
                tree_node_id=assertion.tree_node_id,
                packet_key=assertion.packet_key,
                relationship_id=assertion.relationship_id,
                evidence_refs=assertion.evidence_refs,
                observation_kind=assertion.observation_kind,
                domain_class=assertion.domain_class,
                confidence=float(assertion.confidence),
                canonical_authority=False,
            )
        else:
            # Literals remain attributes on an assertion node instead of nodes
            # in PageRank topology.
            assertion_node = f"assertion:{assertion.statement_id}"
            graph.add_node(
                assertion_node,
                node_kind="LITERAL_ASSERTION",
                literal=assertion.object_value,
                predicate=assertion.predicate,
                source_ref=assertion.source_ref,
                source_revision=assertion.source_revision,
                tree_node_id=assertion.tree_node_id,
                canonical_authority=False,
            )
            graph.add_edge(
                assertion.subject_id,
                assertion_node,
                key=assertion.statement_id,
                edge_kind="ASSERTS_LITERAL",
                confidence=float(assertion.confidence),
                canonical_authority=False,
            )

    for relation in relations:
        relation_node = f"relation:{relation.relation_id}"
        graph.add_node(
            relation_node,
            node_kind="NARY_RELATION",
            relationship_id=relation.relation_id,
            relation_type=relation.relation_type,
            degree=relation.degree,
            source_ref=relation.source_ref,
            source_revision=relation.source_revision,
            evidence_refs=relation.evidence_refs,
            domain_class=relation.domain_class,
            canonical_authority=False,
        )
        for participant in sorted(relation.participants, key=lambda item: item.ordinal):
            graph.add_node(participant.canonical_id, node_kind="ENTITY")
            graph.add_edge(
                relation_node,
                participant.canonical_id,
                key=f"{relation.relation_id}:{participant.ordinal}",
                edge_kind="PARTICIPANT",
                role=participant.role,
                ordinal=participant.ordinal,
                source_ref=participant.source_ref or relation.source_ref,
                tree_node_id=participant.tree_node_id,
                canonical_authority=False,
            )
    return graph


def build_pagerank_view(multigraph):
    """Collapse semantic/incidence edges into a weighted derived PageRank graph.

    Provenance/literal nodes are excluded. N-ary relation incidence is normalized
    by relation degree so a high-degree relation does not receive accidental
    pairwise-clique authority.
    """
    try:
        import networkx as nx
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("networkx is required") from exc

    graph = nx.DiGraph(kind="ATLAS_PAGERANK_DERIVED_V1", canonical_authority=False)
    for node, attrs in multigraph.nodes(data=True):
        if attrs.get("node_kind") in {"ENTITY", "NARY_RELATION"}:
            graph.add_node(node, **attrs)

    for source, target, _key, attrs in multigraph.edges(keys=True, data=True):
        if source not in graph or target not in graph:
            continue
        if attrs.get("edge_kind") == "PARTICIPANT":
            degree = max(int(multigraph.nodes[source].get("degree", 1)), 1)
            weight = 1.0 / degree
            # Bidirectional incidence permits relevance to move entity↔relation
            # without pretending this is a canonical pairwise relation.
            for u, v in ((source, target), (target, source)):
                if graph.has_edge(u, v):
                    graph[u][v]["weight"] += weight
                else:
                    graph.add_edge(u, v, weight=weight, projection="NARY_INCIDENCE")
        else:
            weight = max(float(attrs.get("confidence", 1.0)), 0.0)
            if graph.has_edge(source, target):
                graph[source][target]["weight"] += weight
            else:
                graph.add_edge(source, target, weight=weight, projection="SEMANTIC_ASSERTION")
    return graph


def networkx_pagerank(multigraph, *, alpha: float = 0.85) -> Json:
    try:
        import networkx as nx
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("networkx is required") from exc
    graph = build_pagerank_view(multigraph)
    scores = nx.pagerank(graph, alpha=alpha, weight="weight") if graph.number_of_nodes() else {}
    return {
        "schema": "atlas.semantic-ontology-pagerank-receipt.v1",
        "alpha": alpha,
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "scores": dict(sorted((str(key), float(value)) for key, value in scores.items())),
        "score_checksum": logical_checksum(scores),
        "canonical_authority": False,
    }


def owlrl_closure(dataset, *, inference_revision: str):
    """Run optional OWL-RL closure in an isolated inferred named graph.

    The closure is useful for scalable rule-like ontology entailments, but the
    new triples do not receive source provenance automatically. They are kept in
    a separate graph and must be linked to input evidence by Atlas before any
    promotion.
    """
    try:
        from rdflib import Graph, Literal, Namespace, URIRef
        from owlrl import DeductiveClosure, OWLRL_Semantics
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("rdflib + owlrl are required for OWL-RL closure") from exc

    ATLAS = Namespace("urn:atlas:vocab:")
    union = Graph()
    for graph in dataset.graphs():
        for triple in graph:
            union.add(triple)
    before = set(union)
    DeductiveClosure(OWLRL_Semantics).expand(union)
    inferred = sorted(set(union) - before, key=lambda triple: tuple(map(str, triple)))
    target = dataset.graph(URIRef(f"urn:atlas:inference:owlrl:{quote(inference_revision, safe='')}"))
    for subject, predicate, obj in inferred:
        target.add((subject, predicate, obj))
    receipt = URIRef(f"urn:atlas:inference-receipt:owlrl:{quote(inference_revision, safe='')}")
    target.add((receipt, ATLAS.inferenceMethod, Literal("OWL_RL")))
    target.add((receipt, ATLAS.inferenceRevision, Literal(inference_revision)))
    target.add((receipt, ATLAS.inferredTripleCount, Literal(len(inferred))))
    return dataset, {
        "schema": "atlas.owlrl-inference-receipt.v1",
        "inference_revision": inference_revision,
        "inferred_triple_count": len(inferred),
        "inferred_checksum": logical_checksum([tuple(map(str, triple)) for triple in inferred]),
        "canonical_authority": False,
    }


def validate_shacl(dataset, shapes_graph, *, inference: str = "none") -> Json:
    """Validate RDF shape constraints without treating conformance as truth."""
    try:
        from rdflib import Graph
        from pyshacl import validate
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("rdflib + pyshacl are required for SHACL validation") from exc

    data = Graph()
    for graph in dataset.graphs():
        for triple in graph:
            data.add(triple)
    conforms, results_graph, results_text = validate(
        data,
        shacl_graph=shapes_graph,
        inference=inference,
        abort_on_first=False,
        allow_infos=False,
        allow_warnings=False,
        meta_shacl=False,
        advanced=False,
        js=False,
        debug=False,
    )
    serialized = results_graph.serialize(format="nt") if hasattr(results_graph, "serialize") else str(results_graph)
    return {
        "schema": "atlas.shacl-validation-receipt.v1",
        "conforms": bool(conforms),
        "inference": inference,
        "results_checksum": logical_checksum(serialized),
        "results_text_checksum": logical_checksum(str(results_text)),
        "canonical_authority": False,
    }


def owlready_reasoning_plan(*, require_swr_l: bool = False) -> Json:
    """Describe when Atlas should invoke heavyweight OWL DL reasoning."""
    return {
        "schema": "atlas.owlready-reasoning-plan.v1",
        "engine": "OWLREADY2",
        "reasoners": ["HERMIT", "PELLET"],
        "use_for": [
            "OWL_CLASSIFICATION",
            "CONSISTENCY_CHECK",
            "OBJECT_PROPERTY_INFERENCE",
            *( ["SWRL_DATA_PROPERTY_INFERENCE"] if require_swr_l else [] ),
        ],
        "do_not_use_for": [
            "PAGERANK",
            "VECTOR_SEARCH",
            "CANONICAL_IDENTITY",
            "SOURCE_PROVENANCE_OWNER",
            "MASSIVE_GENERAL_GRAPH_ANALYTICS",
        ],
        "execution": "BOUNDED_EXTERNAL_REASONER",
        "canonical_authority": False,
    }


def polynomial_feature_interactions(values: Sequence[float], *, degree: int = 2) -> tuple[float, ...]:
    """Small deterministic polynomial feature expansion for reranking only.

    This is not ontology reasoning. It creates numerical interaction features
    such as x_i*x_j for a bounded feature row; no fact is inferred from it.
    """
    if degree not in {1, 2}:
        raise ValueError("only degree 1 or 2 is admitted in the bounded reference")
    source = tuple(float(value) for value in values)
    if degree == 1:
        return source
    result = list(source)
    for i, left in enumerate(source):
        for right in source[i:]:
            result.append(left * right)
    return tuple(result)


def describe_semantic_ontology_stack() -> str:
    return (
        "RDFLib Dataset owns the semantic interchange/provenance projection; NetworkX is a derived analytics view; "
        "OWL-RL and pySHACL provide bounded rule/shape processing; Owlready2 is reserved for bounded OWL DL/SWRL "
        "reasoning. source_ref/tree_node_id remain provenance coordinates, N-ary relations remain relation-node "
        "incidence structures, and PageRank/vector/low-rank/polynomial/bit features never create canonical facts."
    )
