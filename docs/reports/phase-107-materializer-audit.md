# Phase 107 Materializer Audit

Status: audit complete, rewrite not started.

## Summary

The current materializer at `scripts/atlas/materialize-registry-structural-lexical-domain.mts` is still the old cheap-lane projection. It reads `atlas_packets` plus legacy tables named `feature_structural`, `feature_lexical`, `feature_domain`, and `feature_domains`, then writes to `registry_enrichment_projection` when `--dry-run` is not set.

The live database does not expose those legacy source tables. It exposes the aligned fact tables instead: `feature_lexical_facts`, `feature_domain_facts`, `feature_structural_facts`, and `feature_ontology_tuples`. That is the core contract mismatch.

## Current script behavior

- Source tables assumed: `atlas_packets`, `feature_structural`, `feature_lexical`, `feature_domain`, `feature_domains`
- Join keys used: `packet_key`, `source_ref`
- Output fields: `packet_key`, `source_ref`, `symbols`, `ast_facts`, `keywords`, `bm25_terms`, `identifiers`, `file_tokens`, `domain_class`, `materialization_version`
- Insert target: `registry_enrichment_projection`
- Conflict key: `packet_key`
- Dry-run writes: no writes when `--dry-run` is present
- Missing optional tables/columns: caught inside the extractor helpers and converted to empty arrays or `null`
- Unresolved rows: not surfaced as explicit records; the run continues with best-effort fallback values

### Unsafe assumptions in the script

- The script assumes legacy table names that do not match the aligned live tables.
- The script assumes domain fallback heuristics based on path substrings are acceptable as a general fallback.
- The script assumes `source_ref.includes(...)` is safe on every packet row; a null `source_ref` falls into the catch path rather than a structured quarantine.
- The script does not introspect the live schema before querying.

## Callers and tests

- Caller found: `scripts/atlas/unified-registry-repair-loop.mts`
- Search results did not show a direct unit test for this materializer.

## Live schema findings

### `feature_implementations`

- Rows: 18
- PK: `id`
- Unique: `feature_key`
- Live join columns present: `packet_key`, `source_ref`, `content_hash`, `processing_pass_id`
- Non-null coverage: `packet_key=0`, `source_ref=0`, `content_hash=0`

### `feature_file_edges`

- Rows: 34
- PK: `id`
- Foreign key: `feature_key -> feature_implementations.feature_key`
- Live join columns present: `packet_key`, `source_ref`, `content_hash`, `stable_key`
- Coverage: `packet_key=28`, `source_ref=28`, `content_hash=0`
- Unresolved rows: 6

### `feature_domain_facts`

- Rows: 61,659
- PK: `id`
- Unique: `(packet_key, classifier_version, content_hash)`
- Coverage: `packet_key=61,659`, `source_ref=61,659`, `content_hash=61,659`

### `feature_lexical_facts`

- Rows: 0

### `feature_structural_facts`

- Rows: 0

### `feature_ontology_tuples`

- Rows: 0

### `atlas_packets`

- Rows: 61,659
- PK: `packet_id`
- Unique: `packet_key`
- `sha256` exists but is NULL on every row in the live database
- Identity coverage:
  - `feature_id`: 61,659
  - `feature_label`: 58,365
  - `tree_node_id`: 58,365
  - `qdrant_point_id`: 4,725

## Phase C hash audit

The checked-in Phase C script still writes `content_hash = ap.sha256`, but the live database has `atlas_packets.sha256` null for all 61,659 packets. The live `feature_domain_facts.content_hash` values are all derived migration hashes:

- Canonical source hash: 0
- Derived migration hash: 61,659
- Missing or placeholder: 0
- Invalid hash: 0

Live proof: every `feature_domain_facts.content_hash` equals `md5(packet_key || source_ref)`.

That means the checked-in backfill script is stale relative to the live database state and must be treated as an assumption mismatch, not as runtime truth.

## Unresolved file-edge audit

Six `feature_file_edges` rows remain unresolved. Five are path-normalization mismatches that resolve when the `sveltekit-frontend/` prefix is restored. One is registry drift.

- `hypergraph.4d` -> `PATH_NORMALIZATION_MISMATCH`
- `hyperrag.lane.feature_atlas` -> `PATH_NORMALIZATION_MISMATCH`
- `mcp.trace_server` -> `PATH_NORMALIZATION_MISMATCH`
- `synth.loop` / `handoff-to-claude` -> `PATH_NORMALIZATION_MISMATCH`
- `synth.loop` / `run-loop` -> `PATH_NORMALIZATION_MISMATCH`
- `hyperrag.lane.graph_neighbors` -> `REGISTRY_DRIFT`

## Conclusion

The audit confirms the materializer should be rewritten to prefer the normalized feature facts first and only fall back to `atlas_packets` during migration. The live database has the aligned tables and the current script does not use them.

IMPLEMENTED
- Live schema inspected.
- Current materializer audited.
- Hash provenance audited.

PROVEN
- `feature_implementations` has the additive join columns but no packet coverage.
- `feature_file_edges` has 28/34 joins resolved.
- `feature_domain_facts` has 61,659 derived rows.
- `atlas_packets.sha256` is null across the corpus.

EXPECTED GAPS
- `feature_lexical_facts`, `feature_structural_facts`, `feature_ontology_tuples` are empty.
- The materializer still targets legacy table names.
- The script does not emit explicit quarantine records for unresolved rows.

UNRESOLVED
- Exact rewrite behavior for the new normalized-fact precedence.
- Whether the materializer will preserve current fallback labeling semantics verbatim.

UNSAFE CONSTRAINTS
- Do not add packet foreign keys yet.
- Do not force NOT NULL on join columns.
- Do not treat the stale Phase C script as the live content-hash contract.

NOT YET PROVEN
- A bounded dry-run against the rewritten materializer.
- Whether the rewritten materializer can preserve explicit provenance while switching to normalized facts.

NEXT SAFE ACTION
- Rewrite the materializer against `feature_domain_facts`, `feature_lexical_facts`, `feature_structural_facts`, `feature_ontology_tuples`, `feature_packet_bindings`, resolved `feature_file_edges`, and only then fall back to `atlas_packets`.
