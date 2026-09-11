"""OntologyLinkedTupleAdapter — the class boundary the operator specified,
wrapping the module-level functions in models.py/validation.py/
arrow_adapter.py into one API surface. Deliberately omits (checked
against every method below, not just asserted): create_identity(),
mint_tuple_id(), guess_symbol(), resolve_canonical_id_from_embedding().
Those are Parent Atlas authority operations that live in TypeScript/
Postgres, not here — this class only validates and projects.
"""

from __future__ import annotations

from typing import Sequence

import pyarrow as pa

from parent_atlas_ontology.arrow_adapter import to_arrow_table
from parent_atlas_ontology.models import OntologyLinkedTupleV1
from parent_atlas_ontology.rich_nary import (
    OntologyFanoutAuthorityViewV1,
    RichNaryRelationV1,
    build_authority_rdf_dataset_v1,
    ontology_linked_tuple_to_rich_nary_v1,
    project_binary_edge_v1,
)
from parent_atlas_ontology.semantic_bridge import ontology_linked_tuples_to_nary_relations
from parent_atlas_ontology.validation import validate_ontology_linked_tuple


class OntologyLinkedTupleAdapter:
    """Projection-only adapter over the canonical `OntologyLinkedTupleV1`
    contract (owned by Postgres + the TS schema, never redefined here).
    """

    canonicalAuthority = False

    def validate(self, value: OntologyLinkedTupleV1) -> OntologyLinkedTupleV1:
        """Real enforcement, not a structural pass-through: raises
        `OntologyLinkedTupleValidationError` (with every issue found, not
        just the first) if any field violates the same constraints the
        real TS Zod schema enforces. See validation.py."""
        return validate_ontology_linked_tuple(value)

    def to_arrow(self, values: Sequence[OntologyLinkedTupleV1]) -> pa.Table:
        """ONTO-PY-03, DONE — real Arrow Table via the nested-struct
        schema in arrow_adapter.py, proven lossless via IPC round-trip
        (see onto_py_03_arrow_parity_check.py, 9/9 PASS)."""
        return to_arrow_table(values)

    def to_rich_nary(
        self,
        value: OntologyLinkedTupleV1,
        authority: OntologyFanoutAuthorityViewV1,
        *,
        require_graph_revision: bool = False,
    ) -> RichNaryRelationV1:
        """Authority-qualified rich n-ary view.

        This is the governed seam for new callers. It never falls back from
        sourceRevision to relationRevision and never emits ``unknown`` as a
        substitute for a missing authority axis.
        """
        return ontology_linked_tuple_to_rich_nary_v1(
            value,
            authority,
            require_graph_revision=require_graph_revision,
        )

    def to_authority_rdf(
        self,
        values: Sequence[tuple[OntologyLinkedTupleV1, OntologyFanoutAuthorityViewV1]],
    ):
        """RDF projection of authority-qualified n-ary relations.

        Relation nodes and participation nodes remain derived; the original
        tuple + authority envelope remains the evidence-bearing source object.
        """
        relations = tuple(self.to_rich_nary(value, authority) for value, authority in values)
        return build_authority_rdf_dataset_v1(relations)

    def to_binary_graph_edge(
        self,
        value: OntologyLinkedTupleV1,
        authority: OntologyFanoutAuthorityViewV1,
        *,
        from_role: str,
        to_role: str,
    ) -> dict:
        """Explicit lossy pairwise projection for Neo4j/cuGraph consumers."""
        relation = self.to_rich_nary(value, authority, require_graph_revision=True)
        return project_binary_edge_v1(relation, from_role=from_role, to_role=to_role)

    def to_rdf(self, values: Sequence[OntologyLinkedTupleV1]):
        """ONTO-PY-02 compatibility path.

        Revised 2026-08-31 per the operator's decision to layer on
        `atlas_semantic_ontology_projection.py` rather than build a duplicate
        RDF adapter. Historical fixtures may still use the compatibility
        semantic bridge. New governed callers should prefer `to_authority_rdf`.
        """
        from atlas_semantic_ontology_projection import build_rdflib_dataset

        relations = ontology_linked_tuples_to_nary_relations(values)
        return build_rdflib_dataset(assertions=(), relations=relations)

    def to_graph_projection(self, values: Sequence[OntologyLinkedTupleV1], *, graph_revision: str) -> dict:
        """ONTO-PY-04 compatibility graph snapshot path.

        Delegates to the existing shared NetworkX substrate. New governed
        pairwise graph consumers should prefer `to_binary_graph_edge`, which
        requires an explicit graphRevision in OntologyFanoutAuthorityV1.
        """
        from parent_atlas_ontology.networkx_snapshot import build_networkx_snapshot

        relations = ontology_linked_tuples_to_nary_relations(values)
        return build_networkx_snapshot(assertions=(), relations=relations, graph_revision=graph_revision)
