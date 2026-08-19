"""Parent Atlas ontology-linked tuple analysis view.

Python consumes canonical Atlas tuples; it does not mint canonical tuple identity.
The source-of-truth tuple/materialization owner remains the revisioned Atlas host.

RDFLib is optional and used only to expose an RDF/SPARQL-friendly analysis view.
N-ary relations remain canonical Hyperedge/tuple facts outside RDF; binary RDF
triples are a projection with evidence/hyperedge references retained separately.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Iterator, Mapping, Sequence


@dataclass(frozen=True)
class CanonicalTupleV1:
    tuple_id: str
    subject_id: str
    predicate: str
    object_id: str
    workspace_revision: str
    source_revision: str
    evidence_refs: tuple[str, ...] = ()
    hyperedge_id: str | None = None
    subject_role: str | None = None
    object_role: str | None = None


@dataclass(frozen=True)
class TupleProjectionReceiptV1:
    input_count: int
    projected_count: int
    skipped_count: int
    workspace_revision: str
    source_revision: str
    ontology_revision: str | None
    projection_kind: str = "RDF_BINARY_VIEW"
    canonical_writes: bool = False


def tuple_from_mapping(row: Mapping[str, Any]) -> CanonicalTupleV1:
    """Normalize one host-produced canonical tuple into the Python analysis shape."""
    tuple_id = str(row.get("tuple_id") or row.get("tupleId") or "").strip()
    subject_id = str(row.get("subject_id") or row.get("subjectId") or row.get("source_id") or "").strip()
    predicate = str(row.get("predicate") or row.get("relation_type") or row.get("relationType") or "").strip()
    object_id = str(row.get("object_id") or row.get("objectId") or row.get("target_id") or "").strip()
    workspace_revision = str(row.get("workspace_revision") or row.get("workspaceRevision") or "").strip()
    source_revision = str(row.get("source_revision") or row.get("sourceRevision") or "").strip()
    if not all((tuple_id, subject_id, predicate, object_id, workspace_revision, source_revision)):
        raise ValueError("tuple_id, subject_id, predicate, object_id, workspace_revision and source_revision are required")

    evidence = row.get("evidence_refs") or row.get("evidenceRefs") or ()
    if not isinstance(evidence, Sequence) or isinstance(evidence, (str, bytes, bytearray)):
        raise ValueError("evidence_refs must be a sequence")

    return CanonicalTupleV1(
        tuple_id=tuple_id,
        subject_id=subject_id,
        predicate=predicate,
        object_id=object_id,
        workspace_revision=workspace_revision,
        source_revision=source_revision,
        evidence_refs=tuple(str(v) for v in evidence),
        hyperedge_id=_optional_str(row.get("hyperedge_id") or row.get("hyperedgeId")),
        subject_role=_optional_str(row.get("subject_role") or row.get("subjectRole")),
        object_role=_optional_str(row.get("object_role") or row.get("objectRole")),
    )


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def iter_canonical_tuples(rows: Iterable[Mapping[str, Any]]) -> Iterator[CanonicalTupleV1]:
    for row in rows:
        yield tuple_from_mapping(row)


def build_rdflib_dataset(
    tuples: Iterable[CanonicalTupleV1],
    *,
    workspace_revision: str,
    source_revision: str,
    ontology_revision: str | None = None,
    base_uri: str = "urn:atlas:",
):
    """Build an RDFLib Dataset as a *derived binary projection* of canonical tuples.

    RDF triples are useful for ontology traversal, SKOS/RDFS/OWL experiments and
    SPARQL queries, but they must not replace canonical Atlas n-ary/hyperedge truth.
    """
    try:
        from rdflib import Dataset, URIRef  # type: ignore
    except ImportError as exc:  # pragma: no cover - workstation dependency gate
        raise RuntimeError("RDFLib is optional: pip install rdflib") from exc

    dataset = Dataset()
    graph = dataset.graph(URIRef(f"{base_uri}graph:{workspace_revision}:{source_revision}"))
    projected = 0
    skipped = 0

    for item in tuples:
        if item.workspace_revision != workspace_revision or item.source_revision != source_revision:
            skipped += 1
            continue
        subject = URIRef(f"{base_uri}entity:{_uri_escape(item.subject_id)}")
        predicate = URIRef(f"{base_uri}relation:{_uri_escape(item.predicate)}")
        obj = URIRef(f"{base_uri}entity:{_uri_escape(item.object_id)}")
        graph.add((subject, predicate, obj))
        projected += 1

    receipt = TupleProjectionReceiptV1(
        input_count=projected + skipped,
        projected_count=projected,
        skipped_count=skipped,
        workspace_revision=workspace_revision,
        source_revision=source_revision,
        ontology_revision=ontology_revision,
    )
    return dataset, receipt


def _uri_escape(value: str) -> str:
    from urllib.parse import quote
    return quote(value, safe="-._~:/")


def build_networkx_view(tuples: Iterable[CanonicalTupleV1]):
    """Build a MultiDiGraph binary projection for CPU graph/reference analysis."""
    try:
        import networkx as nx  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("NetworkX is optional: pip install networkx") from exc

    graph = nx.MultiDiGraph()
    for item in tuples:
        graph.add_edge(
            item.subject_id,
            item.object_id,
            key=item.tuple_id,
            relation_type=item.predicate,
            evidence_refs=list(item.evidence_refs),
            hyperedge_id=item.hyperedge_id,
            subject_role=item.subject_role,
            object_role=item.object_role,
            workspace_revision=item.workspace_revision,
            source_revision=item.source_revision,
        )
    return graph
