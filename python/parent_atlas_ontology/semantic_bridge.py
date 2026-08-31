"""ONTO-PY-04 (revised, 2026-08-31): layers `OntologyLinkedTupleV1` on top
of `atlas_semantic_ontology_projection.py`'s general semantic substrate,
per the operator's explicit decision after a real duplication was found:
that module (RDFLib/NetworkX/PageRank/OWL-RL/SHACL, `SemanticAssertion`/
`NarySemanticRelation`) becomes the general projection substrate;
`OntologyLinkedTupleV1` converts into its types and delegates, instead of
`graph_projection.py` re-implementing the same "relation node, never a
pairwise clique" projection logic a second time.

`graph_projection.py` is kept (real, tested, and it surfaced a genuine
finding — no `relation:` prefix in `GraphNodeKeyV1` yet — worth keeping
on record) but is superseded as the adapter's default path; see its own
updated docstring.

Field-mapping decisions made here, stated explicitly rather than
silently guessed (a genuinely ambiguous two-schema mapping, not a
mechanical rename):
- `relation_id`      <- `tupleId` (exact identity match)
- `relation_type`    <- `label` (closest semantic fit; `label` in the
                        ONTO-PY-01 fixture is already relation-type-
                        shaped, e.g. "CODE_REPAIR_CAUSAL_PATH")
- `source_revision`  <- `provenance.sourceRevision`, falling back to
                        `relationRevision`, falling back to the literal
                        string "unknown" only if both are absent (their
                        `NarySemanticRelation` requires a non-empty
                        value; OntologyLinkedTupleV1's `sourceRevision`
                        is itself optional, so this is a real gap-filling
                        choice, not a lossless one-to-one mapping)
- `domain_class`     <- left `None` — no field on OntologyLinkedTupleV1
                        maps to this honestly; `labelKind` is a
                        different concept (pos/tag/ontology, not a
                        domain classification) and using it would be a
                        guess, not a mapping
- participant `ordinal` <- the participant's index in `tuple.participants`
                        (preserves the exact order ONTO-PY-01/03 already
                        proved is preserved through the Python/Arrow layers)
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_semantic_ontology_projection import NarySemanticRelation, RelationParticipant  # noqa: E402

from parent_atlas_ontology.models import OntologyLinkedTupleV1  # noqa: E402


def ontology_linked_tuple_to_nary_relation(tuple_value: OntologyLinkedTupleV1) -> NarySemanticRelation:
    source_revision = tuple_value.provenance.sourceRevision or tuple_value.relationRevision or "unknown"
    participants = tuple(
        RelationParticipant(canonical_id=p.entityId, role=p.role, ordinal=i)
        for i, p in enumerate(tuple_value.participants)
    )
    return NarySemanticRelation(
        relation_id=tuple_value.tupleId,
        relation_type=tuple_value.label,
        source_ref=tuple_value.sourceRef,
        source_revision=source_revision,
        participants=participants,
        evidence_refs=tuple_value.evidenceRefs,
        domain_class=None,
        producer_revision=tuple_value.provenance.producerRevision or "unknown",
    )


def ontology_linked_tuples_to_nary_relations(tuples: Sequence[OntologyLinkedTupleV1]) -> tuple[NarySemanticRelation, ...]:
    return tuple(ontology_linked_tuple_to_nary_relation(t) for t in tuples)
