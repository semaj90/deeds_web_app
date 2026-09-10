# ATLAS-CANONICAL-PROJECTION-FABRIC-01 Admission Gate — 2026-09-09

**Read-only. Zero production mutations.** Repository commit: `9119b12ee03c32ca3a1d4fcd18be49454e80f6e5`. Database: `127.0.0.1:5434`.

Source proposal: ATLAS-CANONICAL-PROJECTION-FABRIC-01 (external architecture review, recorded 2026-09-08)

## Overall verdict: **NOT_SAFE_TO_PROJECT**

10/11 predicates below PASS: IDENTITY_ALIGNED=PARTIAL_PROVEN, REVISION_QUALIFIED=NOT_PROVEN, SYMBOLS_RESOLVED=NOT_PROVEN, SEMANTIC_OWNER_PROVEN=PARTIAL_PROVEN, LATENT_FAMILY_PROVEN=NOT_PROVEN, GRAPH_MANIFEST_SEALED=ABSENT, ORDINAL_MAP_SEALED=ABSENT, PROJECTIONS_CHECKSUM_ALIGNED=NOT_PROVEN, BITFROST_KEYS_DERIVABLE=NOT_PROVEN, ACE_EVIDENCE_GROUNDED=NOT_PROVEN

## Predicates

### `IDENTITY_ALIGNED`: **PARTIAL_PROVEN**
- `sample_size`: 1000
- `duplicate_packet_key_count`: 0
- `missing_qdrant_point_id_count`: 325

### `REVISION_QUALIFIED`: **NOT_PROVEN**
> No live atlas_packets.workspace_revision column exists — this predicate cannot reach PASS via source_revision alone even at 100% join.
- `source_ref_count`: 1000
- `revision_joined_count`: 0

### `SYMBOLS_RESOLVED`: **NOT_PROVEN**
> Table exists (columns: symbol_id, file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id, start/end byte+row, signature_text, source_text_hash, ast_fingerprint, metadata) but is EMPTY (0 rows). Corrects the 2026-09-08 latent-representation-identity audit, which reported this table absent — it exists as schema but has never been populated by a writer; no canonical SymbolVersionV1 registry has real data yet either way.
- `graphify_symbols_exists`: true
- `graphify_symbols_row_count`: 0

### `SEMANTIC_OWNER_PROVEN`: **PARTIAL_PROVEN**
> The current indexing census identifies codebase_chunk_index.content_embedding as the active semantic_768 physical candidate. This predicate remains PARTIAL_PROVEN until the active writer, revision-qualified read path, and Qdrant readback independently prove ownership; atlas_packets.embedding and codebase_chunk_index.content_embedding_768 remain secondary/transition surfaces.
- `active_candidate_768_columns_present`: ["codebase_chunk_index.content_embedding"]
- `legacy_or_unresolved_768_surfaces_present`: ["atlas_packets.embedding","codebase_chunk_index.content_embedding_768"]

### `LATENT_FAMILY_PROVEN`: **NOT_PROVEN**
> Per the 2026-09-08 identity audit, atlas_representation_records does not exist — there is no producer_id/encoder_revision/input_digest record tying latent_64 (the only populated lane) to a shared-derivation family with any latent_256/latent_128 sibling. Cannot prove a single-input, non-cascaded projection family without it.
- `latent_columns_present`: ["latent_64"]
- `representation_ledger_exists`: false

### `GRAPH_MANIFEST_SEALED`: **ABSENT**
> No GraphProjectionManifestV1-shaped table found. NetworkX/cuGraph/Neo4j currently each run their own graph construction (per CLAUDE.md's NetworkX↔cuGraph parity pipeline) rather than consuming one sealed node/edge manifest.
- `manifest_table_exists`: false

### `ONTOLOGY_COHORT_NONEMPTY`: **PASS**
- `ontology_tables_found`: ["atlas_ontology_concepts","atlas_ontology_tuples","hypergraph_edges","atlas_hyperedges"]
- `total_row_count`: 63084

### `ORDINAL_MAP_SEALED`: **ABSENT**
> No dedicated CandidateOrdinal sealed-map table found. CLAUDE.md documents CandidateOrdinal normalization as a design intent (parent-atlas identity/retrieval alignment section), not yet a table-backed sealed artifact.
- `ordinal_table_exists`: false

### `PROJECTIONS_CHECKSUM_ALIGNED`: **NOT_PROVEN**
> Cannot be proven while atlas_representation_records is absent — there is no checksum field anywhere recording input_checksum/ordinal_map_checksum for cross-projection alignment.
- `depends_on`: "LATENT_FAMILY_PROVEN + GRAPH_MANIFEST_SEALED"

### `BITFROST_KEYS_DERIVABLE`: **NOT_PROVEN**
> Presence of bitfrost:packet:* keys does not by itself prove a derivable domain+cluster+topology+symbol-neighborhood BitFrost key scheme — only that the existing summary cache namespace is populated.
- `sample_key_count`: 0

### `ACE_EVIDENCE_GROUNDED`: **NOT_PROVEN**
> ace_context_sources existing and populated proves an audit trail exists; it does not by itself prove every ACE card cites source spans/symbols/tuples rather than rehydrated raw JSON (ACECardV1 from the proposal) — not checked this pass.
- `table_exists`: true
- `row_count`: 0

## Table existence

- `atlas_packets`: true
- `atlas_representation_records`: false
- `atlas_ast_nodes`: true
- `atlas_tree_nodes`: true
- `graphify_symbols`: true
- `graphify_files`: true
- `codebase_chunk_index`: true
- `atlas_topology_index`: true
- `atlas_ontology_concepts`: true
- `atlas_ontology_tuples`: true
- `hypergraph_edges`: true
- `atlas_hyperedges`: true
- `atlas_candidate_ordinals`: false
- `atlas_graph_projection_manifest`: false
- `atlas_workspace_source_bindings`: true
- `ace_context_sources`: true
- `agent_context_files`: true
- `directory_context_bindings`: true

## Limitations

- none recorded

## Query digests (28 queries, all inside one rolled-back READ ONLY transaction)

- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `d2115895a169e364`: `SELECT packet_id, packet_key, source_ref, qdrant_point_id, tree_node_id, latent_64 FROM atlas_packets WHERE latent_64 IS NOT NULL ORDER BY p…`
- `651d6031589b11ce`: `SELECT source_ref_key, source_revision FROM atlas_ast_nodes WHERE source_ref_key = ANY($1::text[]);`
- `88f68250d9206be0`: `SELECT COUNT(*)::int AS n FROM graphify_symbols;`
- `3af765062b11b7b6`: `SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE udt_name IN ('vector','halfvec','sparsevec') ORDER BY table_n…`
- `353827f9042096a4`: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_packets' AND column_name IN ('latent_25…`
- `d10a4af4b554dc7f`: `SELECT COUNT(*)::int AS n FROM atlas_ontology_concepts;`
- `e3f8b5f134d520a9`: `SELECT COUNT(*)::int AS n FROM atlas_ontology_tuples;`
- `48cb29a6f1f265d6`: `SELECT COUNT(*)::int AS n FROM hypergraph_edges;`
- `162b6a29a958cf33`: `SELECT COUNT(*)::int AS n FROM atlas_hyperedges;`
- `35d2443b3e688999`: `SELECT COUNT(*)::int AS n FROM ace_context_sources;`
