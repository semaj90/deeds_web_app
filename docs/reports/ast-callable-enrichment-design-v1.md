# AST Callable Enrichment v1

## Ownership

- `atlas_ast_nodes`: canonical structural identity and byte-span evidence.
- `atlas_symbol_versions`: revision-specific promoted callable facts.
- `atlas_callable_search`: rebuildable symbol-level retrieval projection.
- `atlas_observation_feature_rows`: packet-level synthesized feature projection.

This tranche does not create a second canonical entity table. It adds domain
classification, parent container, inferred use tags, taxonomy revision, and
JSONB evidence metadata to `atlas_callable_search`.

`inferred_uses` is a bounded derived routing signal, not an authoritative call
graph. Variables remain candidates and are not promoted by enrichment.
