"""Derived ontology observations over canonical Parent Atlas tuples.

The functions here may propose ontology/domain/taxonomy relationships from RDFLib,
NetworkX, Souffle, XGBoost or PyTorch analyses, but they intentionally cannot mint
canonical tuple_id/hyperedge_id values. Promotion belongs to the host validator and
materializer after grounded evidence review.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from typing import Iterable, Literal

from .ontology_tuple_view import CanonicalTupleV1

ObservationKind = Literal[
    "RDF_PATTERN",
    "NETWORKX_PATTERN",
    "SOUFFLE_DERIVATION",
    "XGBOOST_CLASSIFICATION",
    "PYTORCH_CLASSIFICATION",
    "ONTOLOGY_LINK",
]


@dataclass(frozen=True)
class OntologyObservationV1:
    schema: str
    observation_id: str
    observation_kind: ObservationKind
    subject_id: str
    predicate: str
    object_id: str
    workspace_revision: str
    source_revision: str
    ontology_revision: str | None
    source_tuple_ids: tuple[str, ...]
    source_hyperedge_refs: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    confidence: float
    producer_runtime: str
    producer_executor: str
    producer_revision: str
    validation_state: str = "UNVALIDATED"
    canonical_writes: bool = False
    checksum: str = ""


def _checksum(payload: dict) -> str:
    data = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + sha256(data).hexdigest()


def build_observation(
    *,
    kind: ObservationKind,
    subject_id: str,
    predicate: str,
    object_id: str,
    source_tuples: Iterable[CanonicalTupleV1],
    evidence_refs: Iterable[str] = (),
    ontology_revision: str | None = None,
    confidence: float,
    producer_runtime: str = "PYTHON",
    producer_executor: str,
    producer_revision: str,
) -> OntologyObservationV1:
    tuples = tuple(source_tuples)
    if not tuples:
        raise ValueError("ontology observation requires at least one source tuple")
    if not 0.0 <= confidence <= 1.0:
        raise ValueError("confidence must be in [0,1]")

    workspace_revisions = {item.workspace_revision for item in tuples}
    source_revisions = {item.source_revision for item in tuples}
    if len(workspace_revisions) != 1 or len(source_revisions) != 1:
        raise ValueError("source tuples must share one workspace/source revision")

    tuple_ids = tuple(sorted(item.tuple_id for item in tuples))
    hyperedges = tuple(sorted({item.hyperedge_id for item in tuples if item.hyperedge_id}))
    evidence = tuple(sorted({ref for item in tuples for ref in item.evidence_refs} | set(evidence_refs)))
    if not evidence:
        raise ValueError("ontology observation requires grounded evidence refs")

    base = {
        "schema": "atlas.ontology-observation.v1",
        "observation_kind": kind,
        "subject_id": subject_id,
        "predicate": predicate,
        "object_id": object_id,
        "workspace_revision": next(iter(workspace_revisions)),
        "source_revision": next(iter(source_revisions)),
        "ontology_revision": ontology_revision,
        "source_tuple_ids": tuple_ids,
        "source_hyperedge_refs": hyperedges,
        "evidence_refs": evidence,
        "confidence": confidence,
        "producer_runtime": producer_runtime,
        "producer_executor": producer_executor,
        "producer_revision": producer_revision,
        "validation_state": "UNVALIDATED",
        "canonical_writes": False,
    }
    checksum = _checksum(base)
    return OntologyObservationV1(
        observation_id=f"ontology-observation:{checksum.removeprefix('sha256:')[:24]}",
        checksum=checksum,
        **base,
    )


def to_transport_dict(observation: OntologyObservationV1) -> dict:
    """Return a JSON/protobuf-friendly evidence projection."""
    return asdict(observation)
