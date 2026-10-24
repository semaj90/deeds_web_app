# ATLAS-CANONICAL-PROJECTION-FABRIC-01 Admission Gate — 2026-10-23

**Read-only. Zero production mutations.** Repository commit: `c591bf4a3a76af40240d18f4ce7365dd9f52fc05`. Database: `127.0.0.1:5434`.

Source proposal: ATLAS-CANONICAL-PROJECTION-FABRIC-01 (external architecture review, recorded 2026-09-08)

## Overall verdict: **NOT_SAFE_TO_PROJECT**

10/11 predicates below PASS: IDENTITY_ALIGNED=NOT_PROVEN, REVISION_QUALIFIED=NOT_PROVEN, SYMBOLS_RESOLVED=NOT_PROVEN, SEMANTIC_OWNER_PROVEN=PARTIAL_PROVEN, LATENT_FAMILY_PROVEN=PARTIAL_PROVEN, GRAPH_MANIFEST_SEALED=PARTIAL_PROVEN, ORDINAL_MAP_SEALED=NOT_PROVEN, PROJECTIONS_CHECKSUM_ALIGNED=NOT_PROVEN, BITFROST_KEYS_DERIVABLE=NOT_PROVEN, ACE_EVIDENCE_GROUNDED=NOT_PROVEN

## Predicates

### `IDENTITY_ALIGNED`: **NOT_PROVEN**
> Identity is not proven because the sealed admitted repo:root source snapshot or exact packet cohort is unavailable.
- `scope`: "EXACT_ADMITTED_REPO_ROOT_SOURCE_REVISION_COHORT"
- `admitted_workspace_revision`: "sha256:2ecdd4ffc1ab9940023f10cd621affcf18e253c0a8d4a9e90be4b554bb88814a"
- `admitted_root_snapshot_verified`: false
- `admitted_root_exact_revision_packet_count`: 0
- `missing_packet_key_count`: 0
- `duplicate_packet_key_count`: 0
- `missing_qdrant_point_id_count`: 0
- `sample_size_diagnostic_only`: 1000
- `sample_duplicate_packet_key_count_diagnostic_only`: 0
- `sample_missing_qdrant_point_id_count_diagnostic_only`: 0

### `REVISION_QUALIFIED`: **NOT_PROVEN**
> Revision coverage is evaluated against the sealed admitted repo:root snapshot, not the entire historical atlas_packets table. Exact admitted matches=0; mismatched or missing=0; snapshot_verified=false.
- `admitted_workspace_revision`: "sha256:2ecdd4ffc1ab9940023f10cd621affcf18e253c0a8d4a9e90be4b554bb88814a"
- `source_ref_count`: 1000
- `sample_packets_revision_qualified`: 0
- `sample_packets`: 1000
- `table_packets_revision_qualified`: 0
- `table_packets_total`: 61718
- `ast_node_join_count_secondary`: 0
- `admitted_root_snapshot_verified`: false
- `admitted_root_snapshot_source_count`: 0
- `admitted_root_packet_rows`: 0
- `admitted_root_packet_revision_matches`: 0
- `admitted_root_packet_revision_mismatch_or_missing`: 0

### `SYMBOLS_RESOLVED`: **NOT_PROVEN**
> Nomination resolution is not clean or no matching receipt exists for the current admitted revision (sha256:2ecdd4ffc1ab9940023f10cd621affcf18e253c0a8d4a9e90be4b554bb88814a). Run scripts/atlas/symbol-reconciliation-writer-v1.mts --workspace-revision sha256:2ecdd4ffc1ab9940023f10cd621affcf18e253c0a8d4a9e90be4b554bb88814a to produce a fresh receipt before re-auditing.
- `graphify_symbols_exists`: true
- `graphify_symbols_row_count`: 73309
- `atlas_symbol_registry_exists`: true
- `atlas_symbol_registry_row_count`: 10504
- `atlas_symbol_versions_exists`: true
- `atlas_symbol_versions_row_count`: 479
- `reconciliation_gate`: {"status":"BLOCKED_ON_UNGROUNDED_REVISION","bound_source_ref_count":0,"supported_source_ref_count":0,"excluded_generated_artifact_count":0,"graphify_source_ref_present_count":0,"graphify_source_ref_absent_count":0,"revision_mismatch_only_source_ref_count":0,"exact_graphify_source_ref_count":0,"processed_source_ref_count":0,"unprocessed_source_ref_count":0,"parse_failed_source_ref_count":0,"source_refs_with_symbols":0,"exact_revision_symbol_row_count":0,"duplicate_exact_graphify_source_ref_count":0,"missing_exact_graphify_source_ref_count":0}
- `nomination_resolution`: {"source_receipt":null,"nomination_count":0,"canonical_symbol_count":0,"unresolved_symbol_count":null,"ambiguous_symbol_count":null,"clean":false}
- `coverage`: {"bound_source_ref_count":0,"supported_source_ref_count":0,"excluded_generated_artifact_count":0,"exact_graphify_source_ref_count":0,"processed_source_ref_count":0,"unprocessed_source_ref_count":0,"parse_failed_source_ref_count":0,"missing_exact_graphify_source_ref_count":0,"duplicate_exact_graphify_source_ref_count":0,"source_refs_with_symbols":0,"symbol_row_count":0,"coverage_ratio":0,"full_coverage":false}

### `SEMANTIC_OWNER_PROVEN`: **PARTIAL_PROVEN**
> The declared semantic_768 contract target codebase_chunk_index.content_embedding_768 is present. Column presence does not prove a unique writer, revision-qualified reads, per-row representation provenance, or projection readback; content_embedding and atlas_packets.embedding remain historical/unresolved surfaces.
- `canonical_contract_target_present`: ["codebase_chunk_index.content_embedding_768"]
- `historical_or_unresolved_768_surfaces_present`: ["atlas_packets.embedding","codebase_chunk_index.content_embedding"]
- `writerOwnerStatus`: "UNRESOLVED_NOT_PROMOTED"

### `LATENT_FAMILY_PROVEN`: **PARTIAL_PROVEN**
> latent_64, latent_128, latent_256 are all registered with a real, cross-checked artifact digest (state_dict tensor-content checksum, verified live against the checkpoint file and against codebase_chunk_index.latent_256_checkpoint_revision, 55169 rows), producer chain and derivation mechanism (AUTOENCODER for latent_256, SLICE_FIRST_N for the renormalized prefixes) recorded in dimension_method + notes. Still below PASS: no per-row *input*-digest ledger exists (which source semantic_768 snapshot the checkpoint was trained against), and lifecycle_status stays CANDIDATE (no promotion vote taken).
- `latent_columns_present`: ["latent_64"]
- `representation_registry`: "atlas_representations"
- `registry_rows`: 7
- `registry_verified`: 3
- `registry_with_artifact_digest`: 3
- `per_row_input_digest_ledger_exists`: false

### `GRAPH_MANIFEST_SEALED`: **PARTIAL_PROVEN**
> A seal index exists but is stale, revision-mismatched, or does not cover every live in-scope (non-submodule) repository partition -- see bound_to_admitted_workspace_revision / seal_index_covers_live_repositories.
- `legacy_manifest_artifact`: "sveltekit-frontend/docs/reports/graph-snapshot-parity/manifest.json"
- `legacy_manifest_present`: true
- `legacy_graph_revision`: "dff9006fef66e63fb55b98de3feaeb0409ef940cfdc7903bfd69b0f11e075ae2"
- `legacy_node_count`: 162234
- `legacy_edge_count`: 108156
- `legacy_consumers_proven`: ["networkx","cugraph"]
- `legacy_parquet_bytes_match_table_hash`: false
- `seal_index_artifact`: "sveltekit-frontend/docs/reports/graph-snapshot-parity/shards/seal-index.json"
- `seal_index_present`: true
- `seal_index_workspace_revision`: "sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc"
- `seal_index_execution_id`: "74d50c86-8194-45ea-8c3d-61aab737ef83"
- `seal_index_repository_count`: 7
- `bound_to_admitted_workspace_revision`: false
- `live_repository_ids`: []
- `live_in_scope_repository_ids`: []
- `submodule_repositories_excluded_by_design`: []
- `seal_index_covers_live_repositories`: false
- `neo4j_consumes_manifest`: false

### `ONTOLOGY_COHORT_NONEMPTY`: **PASS**
- `ontology_tables_found`: ["atlas_ontology_concepts","atlas_ontology_tuples","hypergraph_edges","atlas_hyperedges"]
- `total_row_count`: 63084

### `ORDINAL_MAP_SEALED`: **NOT_PROVEN**
> Packet-grain map or admitted repo:root snapshot binding is absent/invalid (MANIFEST_OUTSIDE_SNAPSHOT_ROOT).
- `artifact`: ".tmp/atlas/cei24-candidate-ordinal-map-v1/20261016T222429.794Z/candidate-ordinal-map-v1.json"
- `artifact_present`: true
- `owner_receipt`: "cei24-candidate-snapshot-convergence-v1-20261016T222429.794Z.json"
- `owner_receipt_error`: null
- `lineage_filtered_corpus`: {"artifact":"docs/reports/candidate-ordinal-corpus-v1.json","row_count":14564}
- `row_count`: 16151
- `row_count_matches_admitted_root_denominator`: false
- `ordinal_map_checksum`: "413addb327254b5d4085aed35e886c03192aecad882e44ce2ea6b6dda84f2376"
- `ordinal_map_checksum_recomputed`: true
- `candidate_snapshot_revision`: "sha256:85c19c1ac0e4fbfd114203f1a5d822a008e45a1af5c46e738baf86e436c34fd6"
- `candidate_snapshot_receipt_verified`: false
- `admitted_root_snapshot_verified`: false
- `admitted_root_snapshot_error`: "MANIFEST_OUTSIDE_SNAPSHOT_ROOT"
- `workspace_revision_matches_admitted`: false
- `workspace_revision_packet_rows`: 0
- `workspace_revision_rows_outside_admitted_repo_root`: 0
- `admitted_root_candidate_count`: 0
- `exact_identity_matches`: 0
- `revision_exact_matches`: 0
- `missing_ordinal`: 0
- `canonical_id_packet_key_mismatch`: 0
- `excluded_legacy_identity`: 0
- `duplicate_canonical_id`: 0
- `duplicate_packet_key`: 0
- `duplicate_ordinal`: 0
- `orphan_ordinal_rows`: 16151
- `foreign_repository_rows`: 0
- `missing_packet`: 16151
- `missing_source_revision`: 0
- `source_ref_mismatch`: 0
- `workspace_revision_mismatch`: 16151
- `candidate_snapshot_revision_mismatch`: 0
- `invalid_ordinal`: 0
- `ordinal_slot_gaps`: 0
- `ordinal_sequence_valid`: true
- `packet_to_chunk_crosswalk`: "SEPARATE_PENDING_PROJECTION_ALIGNMENT"

### `PROJECTIONS_CHECKSUM_ALIGNED`: **NOT_PROVEN**
> The live atlas_representations registry records representation/artifact metadata, not a per-run projection binding. No ordinal_map_checksum column was found in public table columns; no receipt currently proves the same input and ordinal-map checksums across the projections. Keep NOT_PROVEN; do not create a parallel registry solely to satisfy this predicate.
- `depends_on`: "LATENT_FAMILY_PROVEN + GRAPH_MANIFEST_SEALED"
- `representation_registry`: "atlas_representations"
- `representation_registry_exists`: true
- `representation_registry_checksum_columns`: []
- `ordinal_map_checksum_columns_found`: ["atlas_learned_artifact_admission_v1.ordinal_map_checksum"]

### `BITFROST_KEYS_DERIVABLE`: **NOT_PROVEN**
> The v1 key namespace is counted separately from the legacy bitfrost:packet:* prefix. Even observed keys prove presence only: promotion still requires the admitted ACE packet-key producer/caller, identity-bound write/readback, and current artifact checksums. Deterministic key-builder fixture tests are not live cache-warming proof.
- `key_contract`: "AceBitfrostCacheIdentityV1 / atlas:bitfrost:v1:*"
- `current_v1_namespace_key_count`: 0
- `legacy_bitfrost_packet_key_count`: 0

### `ACE_EVIDENCE_GROUNDED`: **NOT_PROVEN**
> ace_context_sources is a legacy diagnostic only; its row count cannot prove production retrieval admission, AcePacketV3 identity, ContextManifest source grounding, or independent readback.
- `table_exists`: true
- `legacy_row_count`: 0
- `evidence_owner`: "CANONICAL_RETRIEVAL_TO_ACE_V3_CONTEXTMANIFEST_RECEIPT_REQUIRED"

## Table existence

- `atlas_packets`: true
- `atlas_representations`: true
- `atlas_ast_nodes`: true
- `atlas_tree_nodes`: true
- `graphify_symbols`: true
- `graphify_files`: true
- `atlas_symbol_registry`: true
- `atlas_symbol_versions`: true
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

## Query digests (37 queries, all inside one rolled-back READ ONLY transaction)

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
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `7b8d78e10d424c10`: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1;`
- `d2115895a169e364`: `SELECT packet_id, packet_key, source_ref, qdrant_point_id, tree_node_id, latent_64 FROM atlas_packets WHERE latent_64 IS NOT NULL ORDER BY p…`
- `651d6031589b11ce`: `SELECT source_ref_key, source_revision FROM atlas_ast_nodes WHERE source_ref_key = ANY($1::text[]);`
- `2ce65ccaec1d4207`: `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE workspace_revision_key = $1 AND source_revision ~ $2)::int AS qualified FROM atlas_pac…`
- `328ce1a2d05cad41`: `SELECT COUNT(*) FILTER (WHERE workspace_revision_key = $1 AND source_revision ~ $2)::int AS qualified FROM atlas_packets WHERE packet_key = …`
- `88f68250d9206be0`: `SELECT COUNT(*)::int AS n FROM graphify_symbols;`
- `55e02cd39fefc80d`: `SELECT COUNT(*)::int AS n FROM atlas_symbol_registry;`
- `d21de85e918d1be4`: `SELECT COUNT(*)::int AS n FROM atlas_symbol_versions;`
- `67aae12e535b2072`: `WITH admitted AS ( SELECT canonical_source_ref, source_revision, lower(split_part(canonical_source_ref, '.', array_length(string_to_array(ca…`
- `3af765062b11b7b6`: `SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE udt_name IN ('vector','halfvec','sparsevec') ORDER BY table_n…`
- `353827f9042096a4`: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_packets' AND column_name IN ('latent_25…`
- `3993fdb117f3e7ff`: `SELECT representation_id, verification_status, artifact_digest FROM atlas_representations;`
- `d10a4af4b554dc7f`: `SELECT COUNT(*)::int AS n FROM atlas_ontology_concepts;`
- `e3f8b5f134d520a9`: `SELECT COUNT(*)::int AS n FROM atlas_ontology_tuples;`
- `48cb29a6f1f265d6`: `SELECT COUNT(*)::int AS n FROM hypergraph_edges;`
- `162b6a29a958cf33`: `SELECT COUNT(*)::int AS n FROM atlas_hyperedges;`
- `7d490567e2829b03`: `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('input_checksum', 'ordinal_ma…`
- `35d2443b3e688999`: `SELECT COUNT(*)::int AS n FROM ace_context_sources;`
