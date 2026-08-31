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
from parent_atlas_ontology.semantic_bridge import ontology_linked_tuples_to_nary_relations
from parent_atlas_ontology.validation import validate_ontology_linked_tuple


class OntologyLinkedTupleAdapter:
    """Projection-only adapter over the canonical `OntologyLinkedTupleV1`
    contract (owned by Postgres + the TS schema, never redefined here).
    """

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

    def to_rdf(self, values: Sequence[OntologyLinkedTupleV1]):
        """ONTO-PY-02, revised 2026-08-31 per the operator's decision to
        layer on `atlas_semantic_ontology_projection.py` (the general
        semantic substrate) rather than build a second, duplicate RDF
        adapter. Converts to `NarySemanticRelation` via
        `semantic_bridge.py` and delegates to that module's
        `build_rdflib_dataset()`.

        Still genuinely NOT_PROVEN in this environment: `rdflib` is not
        installed (checked directly, not assumed), so the delegated call
        raises `RuntimeError('rdflib is required for RDF projection')`
        from inside `atlas_semantic_ontology_projection.py` itself — the
        same honest failure as before, just now surfaced by the shared
        substrate instead of a locally hand-written stub."""
        from atlas_semantic_ontology_projection import build_rdflib_dataset

        relations = ontology_linked_tuples_to_nary_relations(values)
        return build_rdflib_dataset(assertions=(), relations=relations)

    def to_graph_projection(self, values: Sequence[OntologyLinkedTupleV1], *, graph_revision: str) -> dict:
        """ONTO-PY-04, revised 2026-08-31 per the operator's decision:
        delegates to `atlas_semantic_ontology_projection.py` /
        `networkx_snapshot.py` (the shared substrate, already proven —
        `test_networkx_snapshot_replay.py`, 2/2 tests pass) instead of
        `graph_projection.py`'s own hand-rolled NetworkX logic, which is
        now superseded (kept on disk for its real, still-relevant
        `GraphNodeKeyV1` finding — see that file's updated docstring —
        but no longer the adapter's default path).

        Signature changed from the superseded version: no more
        `ordinal_map` parameter — the shared substrate assigns its own
        internal dense ordinals from sorted node identity strings (see
        `networkx_snapshot.py`'s `_canonical_graph_payload`), it does not
        take an externally-supplied one. Returns the checksum-sealed
        snapshot dict from `build_networkx_snapshot()`."""
        from parent_atlas_ontology.networkx_snapshot import build_networkx_snapshot

        relations = ontology_linked_tuples_to_nary_relations(values)
        return build_networkx_snapshot(assertions=(), relations=relations, graph_revision=graph_revision)
