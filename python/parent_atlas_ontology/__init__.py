"""ONTO-PY-01: Python execution/interoperability layer for
OntologyLinkedTupleV1 (the real, canonical TS/Postgres contract at
sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts).

This package does NOT create a new identity or envelope owner. It is a
typed, validated Python VIEW over the same tuple shape Postgres already
persists (table atlas_ontology_linked_tuples) — mirroring the boundary
this repo's own OaK schema (packages/parent-atlas/src/core/
ontology-kernel-schema-v1.ts) already draws around OntologyLinkedTupleV1:
a checksum-sealed view, never a redefinition of semantics.

Explicitly out of scope for every module in this package (per the
operator's own boundary): create_identity(), mint_tuple_id(),
guess_symbol(), resolve_canonical_id_from_embedding(). Those are Parent
Atlas authority operations that live in TypeScript/Postgres, not here.
"""
