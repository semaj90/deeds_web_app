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

    def to_rdf(self, value: OntologyLinkedTupleV1):
        """ONTO-PY-02, NOT BUILT. `rdflib` is not installed in this
        environment (checked directly via `import rdflib` ->
        ModuleNotFoundError, not assumed) — raising rather than silently
        no-opping or returning a fake success, per this repo's own
        CREATED/WIRED/NOT_PROVEN status discipline. Needs the operator's
        go-ahead on adding python/requirements-ontology-adapter.txt
        (matching the repo's existing per-feature requirements-*.txt
        convention) before this method can be implemented and tested."""
        raise RuntimeError(
            "ONTO-PY-02 not built: rdflib is not installed in this environment. "
            "See openspec/changes/parent-atlas-ontology-kernel/tasks.md ONTO-PY-02 "
            "for the pending dependency decision."
        )

    def to_graph_projection(self, values: Sequence[OntologyLinkedTupleV1], ordinal_map):
        """ONTO-PY-04, NOT BUILT. NetworkX is available in this
        environment (confirmed), but the frozen GraphOrdinal map / relation-
        node n-ary projection design (participant A/B/C/D -> R17 <- rather
        than pairwise edges, per the operator's own diagram) has not been
        implemented or tested yet. Raising rather than returning a
        half-built projection that looks done but silently drops the
        n-ary structure — the exact failure mode this whole adapter
        package exists to prevent."""
        raise RuntimeError(
            "ONTO-PY-04 not built: NetworkX/cuGraph n-ary relation-node projection "
            "is not implemented yet. See openspec/changes/parent-atlas-ontology-kernel/"
            "tasks.md ONTO-PY-04."
        )
