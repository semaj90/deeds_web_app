"""Authority-qualified n-ary view over Parent Atlas OntologyLinkedTupleV1.

The canonical evidence-bearing object remains OntologyLinkedTupleV1 plus its
separate OntologyFanoutAuthorityV1 admission envelope.  This module does not
mint tuple IDs, revisions, packet identities, or ontology concepts.  It only
validates an already-known tuple + authority pair and exposes projection-safe
views for RDF/OWL/Neo4j/cuGraph/agent consumers.

Design rule: CAPTURE RICH ONCE -> PROJECT MANY WAYS.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Any, Optional, Sequence

from atlas_semantic_ontology_projection import NarySemanticRelation, RelationParticipant
from parent_atlas_ontology.models import OntologyLinkedTupleV1
from parent_atlas_ontology.validation import validate_ontology_linked_tuple


FORBIDDEN_REVISION_TOKENS = frozenset(
    {"unknown", "undefined", "null", "none", "latest", "current", "unset", "n/a", "na"}
)
_CONTENT_HASH_RE = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)


def is_authoritative_revision(value: object) -> bool:
    normalized = str(value if value is not None else "").strip().lower()
    return bool(normalized) and normalized not in FORBIDDEN_REVISION_TOKENS


def _require_authoritative_revision(value: object, field_name: str) -> None:
    if not is_authoritative_revision(value):
        raise ValueError(f"{field_name.upper()}_UNPROVEN")


def _require_nonempty(value: object, field_name: str) -> str:
    normalized = str(value if value is not None else "").strip()
    if not normalized:
        raise ValueError(f"{field_name.upper()}_REQUIRED")
    return normalized


@dataclass(frozen=True, slots=True)
class OntologyFanoutAuthorityViewV1:
    """Python mirror of the TS OntologyFanoutAuthorityV1 admission envelope."""

    schemaVersion: str
    packetKey: str
    sourceRef: str
    contentHash: str
    sourceRevision: str
    workspaceRevision: str
    representationId: str
    representationRevision: str | int
    featureRevision: str
    ontologyRevision: str
    producerRevision: str
    evidenceRefs: tuple[str, ...]
    ontologyIds: tuple[str, ...]
    conceptIds: tuple[str, ...]
    graphRevision: Optional[str] = None

    @staticmethod
    def from_dict(value: dict[str, Any]) -> "OntologyFanoutAuthorityViewV1":
        return OntologyFanoutAuthorityViewV1(
            schemaVersion=value["schemaVersion"],
            packetKey=value["packetKey"],
            sourceRef=value["sourceRef"],
            contentHash=value["contentHash"],
            sourceRevision=value["sourceRevision"],
            workspaceRevision=value["workspaceRevision"],
            representationId=value["representationId"],
            representationRevision=value["representationRevision"],
            featureRevision=value["featureRevision"],
            ontologyRevision=value["ontologyRevision"],
            graphRevision=value.get("graphRevision"),
            producerRevision=value["producerRevision"],
            evidenceRefs=tuple(value.get("evidenceRefs", ())),
            ontologyIds=tuple(value.get("ontologyIds", ())),
            conceptIds=tuple(value.get("conceptIds", ())),
        ).validate()

    def validate(self) -> "OntologyFanoutAuthorityViewV1":
        if self.schemaVersion != "atlas.ontology-fanout-authority.v1":
            raise ValueError("FANOUT_AUTHORITY_SCHEMA_INVALID")
        _require_nonempty(self.packetKey, "packet_key")
        _require_nonempty(self.sourceRef, "source_ref")
        if not _CONTENT_HASH_RE.fullmatch(self.contentHash):
            raise ValueError("CONTENT_HASH_INVALID")
        _require_authoritative_revision(self.sourceRevision, "source_revision")
        _require_authoritative_revision(self.workspaceRevision, "workspace_revision")
        if self.representationId != "semantic_768":
            raise ValueError("REPRESENTATION_NOT_SEMANTIC_768")
        if isinstance(self.representationRevision, bool):
            raise ValueError("REPRESENTATION_REVISION_UNPROVEN")
        if isinstance(self.representationRevision, int):
            if self.representationRevision < 0:
                raise ValueError("REPRESENTATION_REVISION_UNPROVEN")
        else:
            _require_authoritative_revision(self.representationRevision, "representation_revision")
        _require_authoritative_revision(self.featureRevision, "feature_revision")
        _require_authoritative_revision(self.ontologyRevision, "ontology_revision")
        _require_authoritative_revision(self.producerRevision, "producer_revision")
        if self.graphRevision is not None:
            _require_authoritative_revision(self.graphRevision, "graph_revision")
        if not self.evidenceRefs:
            raise ValueError("EVIDENCE_REFS_REQUIRED")
        if not self.ontologyIds:
            raise ValueError("ONTOLOGY_IDS_REQUIRED")
        if not self.conceptIds:
            raise ValueError("CONCEPT_IDS_REQUIRED")
        return self

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schemaVersion,
            "packetKey": self.packetKey,
            "sourceRef": self.sourceRef,
            "contentHash": self.contentHash,
            "sourceRevision": self.sourceRevision,
            "workspaceRevision": self.workspaceRevision,
            "representationId": self.representationId,
            "representationRevision": self.representationRevision,
            "featureRevision": self.featureRevision,
            "ontologyRevision": self.ontologyRevision,
            "graphRevision": self.graphRevision,
            "producerRevision": self.producerRevision,
            "evidenceRefs": list(self.evidenceRefs),
            "ontologyIds": list(self.ontologyIds),
            "conceptIds": list(self.conceptIds),
        }


@dataclass(frozen=True, slots=True)
class RichNaryParticipantV1:
    entityId: str
    entityKind: str
    role: str
    ordinal: int
    label: Optional[str] = None


@dataclass(frozen=True, slots=True)
class RichNaryEvidenceV1:
    sourceRef: str
    sourceRevision: str
    packetKey: str
    evidenceRefs: tuple[str, ...]
    spanStart: Optional[int] = None
    spanEnd: Optional[int] = None


@dataclass(frozen=True, slots=True)
class RichNaryRelationV1:
    """Lossless-enough in-process relation view; never a new authority owner."""

    schema: str
    relationId: str
    relationType: str
    participants: tuple[RichNaryParticipantV1, ...]
    evidence: RichNaryEvidenceV1
    authority: OntologyFanoutAuthorityViewV1
    ontologyIds: tuple[str, ...]
    conceptIds: tuple[str, ...]
    confidence: float
    evidenceState: str
    canonicalAuthority: bool = False

    @property
    def graphProjectionEligible(self) -> bool:
        return is_authoritative_revision(self.authority.graphRevision)

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["graphProjectionEligible"] = self.graphProjectionEligible
        return value


def _includes_all(haystack: Sequence[str], needles: Sequence[str]) -> bool:
    known = {str(value).strip() for value in haystack if str(value).strip()}
    return all(str(value).strip() in known for value in needles)


def ontology_linked_tuple_to_rich_nary_v1(
    tuple_value: OntologyLinkedTupleV1,
    authority: OntologyFanoutAuthorityViewV1,
    *,
    require_graph_revision: bool = False,
) -> RichNaryRelationV1:
    """Build an authority-qualified n-ary view without synthesizing anything."""

    validate_ontology_linked_tuple(tuple_value)
    authority.validate()

    if tuple_value.evidenceState != "ACTIVE_VERIFIED":
        raise ValueError("EVIDENCE_STATE_NOT_ACTIVE_VERIFIED")
    if not tuple_value.packetKey:
        raise ValueError("PACKET_KEY_UNPROVEN")
    if tuple_value.packetKey != authority.packetKey:
        raise ValueError("PACKET_KEY_MISMATCH")
    if tuple_value.sourceRef != authority.sourceRef:
        raise ValueError("SOURCE_REF_MISMATCH")
    if tuple_value.provenance.sourceRevision != authority.sourceRevision:
        raise ValueError("SOURCE_REVISION_MISMATCH")
    if not tuple_value.evidenceRefs:
        raise ValueError("EVIDENCE_REFS_REQUIRED")
    if not _includes_all(tuple_value.evidenceRefs, authority.evidenceRefs):
        raise ValueError("EVIDENCE_REFS_NOT_GROUNDED")
    if tuple_value.labelKind == "ontology":
        if not tuple_value.ontologyIds or not tuple_value.conceptIds:
            raise ValueError("ONTOLOGY_CONCEPT_IDS_REQUIRED")
        if not _includes_all(tuple_value.ontologyIds, authority.ontologyIds):
            raise ValueError("ONTOLOGY_ID_MISMATCH")
        if not _includes_all(tuple_value.conceptIds, authority.conceptIds):
            raise ValueError("CONCEPT_ID_MISMATCH")
    if len(tuple_value.participants) < 2:
        raise ValueError("NARY_RELATION_REQUIRES_AT_LEAST_TWO_PARTICIPANTS")
    if tuple_value.evidenceSpan and tuple_value.evidenceSpan.sourceRef != tuple_value.sourceRef:
        raise ValueError("EVIDENCE_SPAN_SOURCE_REF_MISMATCH")
    if require_graph_revision and not is_authoritative_revision(authority.graphRevision):
        raise ValueError("GRAPH_REVISION_UNPROVEN")

    participants = tuple(
        RichNaryParticipantV1(
            entityId=participant.entityId,
            entityKind=participant.entityKind,
            role=participant.role,
            ordinal=ordinal,
            label=participant.label,
        )
        for ordinal, participant in enumerate(tuple_value.participants)
    )
    span = tuple_value.evidenceSpan
    evidence = RichNaryEvidenceV1(
        sourceRef=tuple_value.sourceRef,
        sourceRevision=authority.sourceRevision,
        packetKey=authority.packetKey,
        evidenceRefs=tuple(tuple_value.evidenceRefs),
        spanStart=span.start if span else None,
        spanEnd=span.end if span else None,
    )
    return RichNaryRelationV1(
        schema="atlas.rich-nary-relation.v1",
        relationId=tuple_value.tupleId,
        relationType=tuple_value.label,
        participants=participants,
        evidence=evidence,
        authority=authority,
        ontologyIds=tuple(tuple_value.ontologyIds),
        conceptIds=tuple(tuple_value.conceptIds),
        confidence=float(tuple_value.confidence),
        evidenceState=tuple_value.evidenceState,
        canonicalAuthority=False,
    )


def rich_nary_to_semantic_relation_v1(relation: RichNaryRelationV1) -> NarySemanticRelation:
    """Delegate to the existing relation-node projection substrate."""

    return NarySemanticRelation(
        relation_id=relation.relationId,
        relation_type=relation.relationType,
        source_ref=relation.evidence.sourceRef,
        source_revision=relation.authority.sourceRevision,
        participants=tuple(
            RelationParticipant(
                canonical_id=participant.entityId,
                role=participant.role,
                ordinal=participant.ordinal,
            )
            for participant in relation.participants
        ),
        evidence_refs=relation.evidence.evidenceRefs,
        domain_class=None,
        producer_revision=relation.authority.producerRevision,
        canonical_authority=False,
    )


def project_binary_edge_v1(
    relation: RichNaryRelationV1,
    *,
    from_role: str,
    to_role: str,
) -> dict[str, Any]:
    """Explicit lossy graph-edge projection for Neo4j/cuGraph-style consumers."""

    if not relation.graphProjectionEligible:
        raise ValueError("GRAPH_REVISION_UNPROVEN")
    from_rows = [participant for participant in relation.participants if participant.role == from_role]
    to_rows = [participant for participant in relation.participants if participant.role == to_role]
    if len(from_rows) != 1 or len(to_rows) != 1:
        raise ValueError("BINARY_EDGE_ROLE_CARDINALITY_UNPROVEN")
    return {
        "from": from_rows[0].entityId,
        "to": to_rows[0].entityId,
        "relationId": relation.relationId,
        "relationType": relation.relationType,
        "fromRole": from_role,
        "toRole": to_role,
        "workspaceRevision": relation.authority.workspaceRevision,
        "graphRevision": relation.authority.graphRevision,
        "ontologyRevision": relation.authority.ontologyRevision,
        "sourceRevision": relation.authority.sourceRevision,
        "evidenceRefs": list(relation.evidence.evidenceRefs),
        "canonicalAuthority": False,
    }


def build_authority_rdf_dataset_v1(relations: Sequence[RichNaryRelationV1]):
    """Project rich n-ary relations to RDF while retaining authority metadata.

    The actual relation-node/participation encoding delegates to the existing
    atlas_semantic_ontology_projection substrate.  This function only adds the
    Parent Atlas authority axes to those derived relation nodes.
    """

    try:
        from rdflib import Literal, Namespace, RDF, URIRef
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("rdflib is required for RDF projection") from exc

    from atlas_semantic_ontology_projection import build_rdflib_dataset

    semantic_relations = tuple(rich_nary_to_semantic_relation_v1(relation) for relation in relations)
    dataset = build_rdflib_dataset(assertions=(), relations=semantic_relations)
    atlas = Namespace("urn:atlas:vocab:")

    for relation in relations:
        matches: list[tuple[Any, Any]] = []
        for graph in dataset.graphs():
            for node in graph.subjects(RDF.type, atlas.NaryRelation):
                relation_id = next(graph.objects(node, atlas.relationshipId), None)
                if relation_id is not None and str(relation_id) == relation.relationId:
                    matches.append((graph, node))
        if len(matches) != 1:
            raise ValueError("RDF_RELATION_NODE_IDENTITY_AMBIGUOUS")
        graph, node = matches[0]
        authority = relation.authority
        graph.add((node, atlas.packetKey, Literal(authority.packetKey)))
        graph.add((node, atlas.workspaceRevision, Literal(authority.workspaceRevision)))
        graph.add((node, atlas.graphRevision, Literal(authority.graphRevision or "")))
        graph.add((node, atlas.ontologyRevision, Literal(authority.ontologyRevision)))
        graph.add((node, atlas.featureRevision, Literal(authority.featureRevision)))
        graph.add((node, atlas.representationId, Literal(authority.representationId)))
        graph.add((node, atlas.representationRevision, Literal(str(authority.representationRevision))))
        graph.add((node, atlas.contentHash, Literal(authority.contentHash)))
        graph.add((node, atlas.canonicalAuthority, Literal(False)))
        for ontology_id in relation.ontologyIds:
            graph.add((node, atlas.ontologyId, Literal(ontology_id)))
        for concept_id in relation.conceptIds:
            graph.add((node, atlas.conceptId, Literal(concept_id)))

    return dataset
