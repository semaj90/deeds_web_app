# Latent Representation Identity Audit — 2026-09-03

**Read-only. Zero production mutations.** Repository commit: `9f2571ddf760a4b4b7247d412990c887deeb3939`. Database: `127.0.0.1:5434`.

## Proof status

- `LAT_AUDIT1_READ_ONLY_GUARD`: **PASS**
- `LAT_AUDIT2_SCHEMA_INVENTORY`: **PASS**
- `LAT_AUDIT3_VECTOR_STORE_CLASSIFICATION`: **PARTIAL_PROVEN**
- `LAT_AUDIT4_PACKET_IDENTITY`: **PASS**
- `LAT_AUDIT5_QDRANT_JOIN_CLASSIFIED`: **PASS**
- `LAT_AUDIT6_SOURCE_VERSION_JOIN`: **NOT_PROVEN**
- `LAT_AUDIT7_TREE_JOIN`: **PARTIAL_PROVEN**
- `LAT_AUDIT8_SYMBOL_JOIN`: **NOT_PROVEN**
- `LAT_AUDIT9_BYTEA_ENCODING_CONTRACT`: **PARTIAL_PROVEN**
- `LAT_AUDIT10_REPRESENTATION_LEDGER`: **NOT_PROVEN**
- `LAT_AUDIT11_LINEAGE_CLASSIFICATION`: **PASS**
- `LAT_AUDIT12_JSON_REPORT`: **PASS**
- `LAT_AUDIT13_MARKDOWN_REPORT`: **PASS**
- `LAT_AUDIT14_ZERO_PRODUCTION_MUTATIONS`: **PASS**

## Sample

- `selected_count`: 1000
- `packet_id_count`: 1000
- `packet_key_count`: 1000
- `qdrant_point_id_count`: 675
- `source_ref_count`: 1000
- `sample_selection_digest`: 63204034d8c7c16ac5a865a5a5a3f0e4688ce0586c1585dee08d94c749822a2f
- `first_packet_id`: packet:000db15dc8ef
- `last_packet_id`: packet:13460638e860

## Packet identity

- `duplicate_packet_id_count`: 0
- `duplicate_packet_key_count`: 0
- `duplicate_qdrant_point_id_count`: 0
- `source_ref_fanout_count`: 0
- `missing_packet_key_count`: 0
- `missing_source_ref_count`: 0
- `missing_qdrant_point_id_count`: 325

> qdrant_point_id is a projection identifier, not canonical identity — never treated as such in this audit

## Qdrant identity (bounded scroll, 250 points)

- `MISSING_SOURCE_REVISION`: 250

> Writer resolution order observed: backfill-latent-vectors.mjs resolves rows via: (1) qdrant_point_id exact match, (2) packet_key ANY() match with sveltekit-frontend/ prefix variants, (3) source_ref ANY() match with prefix variants, (4) JSONB payload/metadata containment fallback on qdrant_point_id/packet_key/packetKey/source_ref/sourceRef/primary_id — none of these branches require or verify source_revision or workspace_revision

## Source lineage

- `source_ref_joined_count`: 0
- `source_version_joined_count`: 0
- `source_join_missing_count`: 1000
- `source_join_ambiguous_count`: 0
- `workspace_revision_aligned_count`: 0
- `workspace_revision_mismatch_count`: 0

> atlas_ast_nodes.source_revision (joined via source_ref_key) is the only live revision-bearing proxy found — NOT a canonical source_version_id join, which does not exist yet (GS1.10 NOT_PROVEN). workspace_revision alignment not computed: no live packet-side workspace_revision column found on atlas_packets.

## Tree and symbol lineage

- `tree_node_joined_count`: 1000
- `tree_node_missing_count`: 0
- `tree_node_fanout_count`: 0
- `tree_node_id_format_mismatch_count`: 0
- `graphify_symbol_joined_count`: 0
- `graphify_symbol_missing_count`: 1000
- `symbol_join_ambiguous_count`: 0
- `stable_symbol_key_present_count`: 0
- `symbol_version_id_present_count`: 0

> graphify_symbols does not exist live (confirmed via schema inventory) — all symbol-join metrics are structurally 0/ABSENT, not a bug in this audit. atlas_ast_nodes is the only live AST-adjacent table; atlas_tree_nodes is a separate, provisional structural-inventory table (GS1.10: "provisional structural inventory, not canonical graph identity"). REAL FINDING this pass: atlas_packets.tree_node_id is declared `text` but 0/1000 sampled non-null values are NOT UUID-formatted (they look like content-hash strings, e.g. sha1/sha256-length hex) — while atlas_tree_nodes.node_id is declared `uuid`. A naive `::uuid` cast join throws 22P02; this audit casts the uuid side to text instead so the join can even be attempted. This is itself evidence of an unreconciled tree_node_id identity scheme, separate from GS1.10's already-known provisional-identity finding. Production writer/retrieval-path consumption of atlas_ast_nodes vs atlas_tree_nodes was not independently re-verified in this pass — see GS1.10-GS1.12 for prior findings.

## BYTEA contract

- `non_null_latent_count`: 1000
- `distinct_byte_lengths`: 1
- `minimum_byte_length`: 256
- `maximum_byte_length`: 256
- `uniform_byte_length`: true
- `encoding_contract_result`: CONSISTENT_WITH_64_FLOAT32_LITTLE_ENDIAN(byte length 256 = 64*4, matches backfill-latent-vectors.mjs writeFloatLE encoding — but dtype/byte-order are read from the writer source code, not derived from the bytes themselves)

> Dimension/dtype/byte-order are asserted from reading backfill-latent-vectors.mjs source (floatArrayToBuffer: writeFloatLE, 4 bytes/float, 64 floats), not inferred from the column name. No producer_id/producer_revision/serialization-method field exists anywhere on atlas_packets to make this a proven encoding contract — do not infer float32 merely because the field is named latent_64.

## Representation ledger

atlas_representation_records DOES NOT EXIST live (confirmed via schema inventory) — this is a real, total absence, not a query bug. atlas_packets does carry source_representation_id/projection_representation_id/representation_revision columns (confirmed live), but generic packet metadata is not a complete representation ledger per this audit's own definition (producer identity, input digest, parameters digest all absent).

## Lineage classification (1000 sampled rows)

- `NUMERIC_BYTES_PRESENT`: 1000
- `REPRESENTATION_RECORD_PRESENT`: 0
- `SOURCE_VERSION_JOINED`: 0
- `SYMBOL_VERSION_JOINED`: 0
- `FULL_LINEAGE_PROVEN`: 0
- `PARTIAL_LINEAGE`: 0
- `LINEAGE_MISSING`: 1000
- `AMBIGUOUS_JOIN`: 0

## Identity field classification

- `source_version_id`: ABSENT
- `symbol_version_id`: ABSENT
- `stable_symbol_id`: ABSENT
- `representation_revision`: PRESENT(atlas_packets)
- `producer_revision`: PRESENT(graphify_files)
- `input_digest`: ABSENT

## Vector-store inventory (66 columns db-wide)

| Table | Column | Type | Classification |
|---|---|---|---|
| ace_chunks | embedding | vector | UNKNOWN |
| agent_observations | hnsw_embedding | vector | UNKNOWN |
| atlas_class_search_index_v1 | embedding | vector | UNKNOWN |
| atlas_concepts | embedding | vector | UNKNOWN |
| atlas_embeddings_384 | embedding | vector | UNKNOWN |
| atlas_embeddings_64_latent | embedding | vector | UNKNOWN |
| atlas_embeddings_768 | embedding | vector | UNKNOWN |
| atlas_feature_embeddings | embedding | vector | UNKNOWN |
| atlas_packet_registry | embedding_768d | vector | UNKNOWN |
| atlas_packet_registry | latent_384d | vector | UNKNOWN |
| atlas_packets | content_embedding_384 | vector | LEGACY |
| atlas_packets | embedding | vector | CANONICAL_SOURCE |
| atlas_relationship_embeddings | embedding | vector | UNKNOWN |
| atlas_summary_layers | embedding | vector | UNKNOWN |
| canonical_chunks | embedding | vector | UNKNOWN |
| chat_embeddings | embedding | vector | UNKNOWN |
| cluster_narratives | narrative_embedding | vector | UNKNOWN |
| cluster_summaries | summary_embedding | vector | UNKNOWN |
| code_retrieval_chunks | embedding | vector | UNKNOWN |
| codebase_chunk_index | content_embedding | halfvec | DERIVED_PROJECTION |
| codebase_chunk_index | content_embedding_768 | vector | CANONICAL_SOURCE |
| codebase_chunk_index | error_embedding | vector | UNKNOWN |
| codebase_chunk_index | latent_256 | halfvec | UNKNOWN |
| codebase_chunk_index | latent_64 | vector | UNKNOWN |
| codebase_chunk_index | signature_embedding | halfvec | UNKNOWN |
| codebase_chunk_index | summary_embedding | halfvec | UNKNOWN |
| codebase_chunk_index | summary_embedding_384 | vector | UNKNOWN |
| codebase_chunk_index_backup | content_embedding | halfvec | UNKNOWN |
| codebase_chunk_index_backup | content_embedding_384 | vector | UNKNOWN |
| codebase_chunk_index_backup | error_embedding | vector | UNKNOWN |
| codebase_chunk_index_backup | signature_embedding | halfvec | UNKNOWN |
| codebase_chunk_index_backup | summary_embedding | halfvec | UNKNOWN |
| codebase_chunk_index_backup | summary_embedding_384 | vector | UNKNOWN |
| community_reports | embedding | vector | UNKNOWN |
| community_reports_leiden | embedding | vector | UNKNOWN |
| diagnosis_events | query_embedding | vector | UNKNOWN |
| document_embeddings | embedding | vector | UNKNOWN |
| embedded_summaries | embedding | vector | UNKNOWN |
| embedding_cache | embedding | vector | UNKNOWN |
| evidence | embedding | vector | UNKNOWN |
| evidence_analysis_cache | result_embedding | vector | UNKNOWN |
| evidence_vectors | embedding | vector | UNKNOWN |
| fixer_patterns | embedding | vector | UNKNOWN |
| legal_chunks | embedding | vector | UNKNOWN |
| legal_documents | content_embedding | vector | UNKNOWN |
| legal_glossary | embedding | vector | UNKNOWN |
| nes_chrom_packets | embedding | vector | UNKNOWN |
| packet_vector_bundles | api_vector | vector | UNKNOWN |
| packet_vector_bundles | content_vector | vector | UNKNOWN |
| packet_vector_bundles | graph_vector | vector | UNKNOWN |
| packet_vector_bundles | keyword_vector | vector | UNKNOWN |
| packet_vector_bundles | latent64_vector | vector | UNKNOWN |
| packet_vector_bundles | summary_vector | vector | UNKNOWN |
| packet_vector_bundles | title_vector | vector | UNKNOWN |
| packet_vector_bundles | topology_vector | vector | UNKNOWN |
| parent_atlas_vectors | embedding | vector | UNKNOWN |
| rag_query_log | query_embedding | halfvec | UNKNOWN |
| research_summaries | embedding | vector | UNKNOWN |
| screenshot_artifacts | caption_embedding | vector | UNKNOWN |
| statute_chunks | embedding | vector | UNKNOWN |
| task_semantic_packets | semantic_vector | vector | UNKNOWN |
| tool_registry | embedding | vector | UNKNOWN |
| warden_chunks | embedding | vector | UNKNOWN |
| warden_chunks | latent128 | vector | UNKNOWN |
| whisper_segments | embedding | vector | UNKNOWN |
| workspace_notes | embedding | vector | UNKNOWN |

## Limitations

- SOURCE_VERSION_JOIN = NOT_PROVEN in this sample — 0 matches (do not synthesize one)

## Query digests (13 queries executed, all inside one rolled-back READ ONLY transaction)

- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `04f15e5820ca959a`: `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER…`
- `3af765062b11b7b6`: `SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE udt_name IN ('vector','halfvec','sparsevec') ORDER BY table_n…`
- `d2115895a169e364`: `SELECT packet_id, packet_key, source_ref, qdrant_point_id, tree_node_id, latent_64 FROM atlas_packets WHERE latent_64 IS NOT NULL ORDER BY p…`
- `d1bedb715d128444`: `SELECT source_ref_key, source_revision, workspace_id FROM atlas_ast_nodes WHERE source_ref_key = ANY($1::text[]);`
- `bcff7b9d54276eb8`: `SELECT node_id::text AS node_id FROM atlas_tree_nodes WHERE node_id::text = ANY($1::text[]);`
- `651d6031589b11ce`: `SELECT source_ref_key, source_revision FROM atlas_ast_nodes WHERE source_ref_key = ANY($1::text[]);`
