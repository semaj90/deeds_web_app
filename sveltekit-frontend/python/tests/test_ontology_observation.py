from __future__ import annotations

import pytest

from parent_atlas_policy.ontology_observation import build_observation
from parent_atlas_policy.ontology_tuple_view import CanonicalTupleV1


def canonical_tuple(tuple_id: str, *, source_revision: str = "19") -> CanonicalTupleV1:
    return CanonicalTupleV1(
        tuple_id=tuple_id,
        subject_id="symbol:foo",
        predicate="CALLS",
        object_id="symbol:bar",
        workspace_revision="742",
        source_revision=source_revision,
        evidence_refs=("evidence:span:1",),
        hyperedge_id="hyperedge:call:1",
        subject_role="caller",
        object_role="callee",
    )


def test_observation_is_grounded_noncanonical_evidence():
    obs = build_observation(
        kind="ONTOLOGY_LINK",
        subject_id="symbol:foo",
        predicate="atlas:belongsToDomain",
        object_id="domain:retrieval",
        source_tuples=[canonical_tuple("tuple:1")],
        confidence=0.9,
        producer_executor="rdflib-rule-v1",
        producer_revision="py-r1",
    )

    assert obs.validation_state == "UNVALIDATED"
    assert obs.canonical_writes is False
    assert obs.source_tuple_ids == ("tuple:1",)
    assert obs.source_hyperedge_refs == ("hyperedge:call:1",)
    assert obs.evidence_refs == ("evidence:span:1",)
    assert obs.checksum.startswith("sha256:")


def test_observation_rejects_mixed_source_revisions():
    with pytest.raises(ValueError, match="one workspace/source revision"):
        build_observation(
            kind="NETWORKX_PATTERN",
            subject_id="a",
            predicate="related",
            object_id="b",
            source_tuples=[canonical_tuple("tuple:1"), canonical_tuple("tuple:2", source_revision="20")],
            confidence=0.5,
            producer_executor="networkx-v1",
            producer_revision="py-r1",
        )


def test_observation_requires_grounded_evidence():
    empty_evidence = CanonicalTupleV1(
        tuple_id="tuple:1",
        subject_id="a",
        predicate="P",
        object_id="b",
        workspace_revision="742",
        source_revision="19",
    )
    with pytest.raises(ValueError, match="grounded evidence"):
        build_observation(
            kind="RDF_PATTERN",
            subject_id="a",
            predicate="related",
            object_id="b",
            source_tuples=[empty_evidence],
            confidence=0.5,
            producer_executor="rdflib-v1",
            producer_revision="py-r1",
        )
