# Cross-Layer Contract Error Map

Generated: 2026-09-08T16:35:12.531Z  |  Findings: 64  |  High: 0  Medium: 63  Low: 0  Info: 1

## Findings

### contract:drizzle-meta-documented_sidecar-001-57b36a33
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0099_atlas_svg_glyphs.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0099_atlas_svg_glyphs.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-002-6f4602d2
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0019_atlas_packet_indexes_gin.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0019_atlas_packet_indexes_gin.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0019_atlas_packet_indexes_gin.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-003-a4252fa5
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0019_bm25_search_vector.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0019_bm25_search_vector.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0019_bm25_search_vector.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-004-68651803
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0020_fix_packet_feature_metrics_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0020_fix_packet_feature_metrics_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0020_fix_packet_feature_metrics_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-005-a99f92ab
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0020_phase10_packet_ontology.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0020_phase10_packet_ontology.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0020_phase10_packet_ontology.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-006-ee4af613
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0020_promotion_outbox.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0020_promotion_outbox.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0020_promotion_outbox.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-007-d932d7eb
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0023_vector_index_registry.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0023_vector_index_registry.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0023_vector_index_registry.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-008-a7a4b8e7
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0035_create_atlas_feature_packets.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0035_create_atlas_feature_packets.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0035_create_atlas_feature_packets.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-009-5e361c49
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0042_unified_registry_enrichment_projections.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0042_unified_registry_enrichment_projections.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0042_unified_registry_enrichment_projections.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-010-bf357c29
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0043_atlas_packet_features_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0043_atlas_packet_features_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0043_atlas_packet_features_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-011-92f7b707
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0043_feature_extraction_tables.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0043_feature_extraction_tables.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0043_feature_extraction_tables.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-012-dc6e7e1f
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0044_phase_107_feature_layer_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0044_phase_107_feature_layer_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0044_phase_107_feature_layer_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-013-4ee9f3c7
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0045_phase_108e_schema_alignment.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0045_phase_108e_schema_alignment.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0045_phase_108e_schema_alignment.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-014-dc0ede6c
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0046_phase_109_unknown_packets.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0046_phase_109_unknown_packets.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0046_phase_109_unknown_packets.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-015-a3dd36d9
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0048_query_cache_metrics.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0048_query_cache_metrics.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0048_query_cache_metrics.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-016-1ad0a7c0
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0052_evaluation_corpus.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0052_evaluation_corpus.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0052_evaluation_corpus.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-017-3c91523d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0053_evaluation_corpus_queries.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0053_evaluation_corpus_queries.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0053_evaluation_corpus_queries.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-018-746e4c4d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0054_evaluation_corpora.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0054_evaluation_corpora.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0054_evaluation_corpora.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-019-2d57a7ab
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0055_evaluation_results.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0055_evaluation_results.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0055_evaluation_results.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-020-86c15c3d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0056_evaluation_evidence.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0056_evaluation_evidence.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0056_evaluation_evidence.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-021-76cbbc9f
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0057_evaluation_relevance.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0057_evaluation_relevance.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0057_evaluation_relevance.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-022-bc594a52
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0058_evaluation_relevance_corrected.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0058_evaluation_relevance_corrected.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0058_evaluation_relevance_corrected.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-023-bc7f0c90
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0059_qdrant_point_id_backfill_tables.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0059_qdrant_point_id_backfill_tables.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0059_qdrant_point_id_backfill_tables.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-024-a11bbe84
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0060_feature_envelope_column.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0060_feature_envelope_column.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0060_feature_envelope_column.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-025-c47e2d28
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0099_agentic_identity_recovery.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0099_agentic_identity_recovery.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0099_agentic_identity_recovery.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-026-5e8aea15
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0099_unified_id_hierarchy.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0099_unified_id_hierarchy.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0099_unified_id_hierarchy.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-027-01af06b0
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0100_atlas_feature_vectors.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0100_atlas_feature_vectors.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0100_atlas_feature_vectors.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-028-c59f32b4
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0100_identity_lane_recovery.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0100_identity_lane_recovery.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0100_identity_lane_recovery.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-029-4efb57ff
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0100_retrieval_events_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0100_retrieval_events_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0100_retrieval_events_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-030-72e7a41b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_encoder_provenance_gate2.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_encoder_provenance_gate2.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_encoder_provenance_gate2.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-031-af1f87b6
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_packet_ast_keyword_features.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_packet_ast_keyword_features.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_packet_ast_keyword_features.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-032-32b1cdcb
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_packet_ontology_tuples.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_packet_ontology_tuples.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_packet_ontology_tuples.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-033-74a5420c
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_spec_control_plane_phase1.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_spec_control_plane_phase1.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_spec_control_plane_phase1.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-034-0245a68c
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0102_feature_statistics_and_potentials.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0102_feature_statistics_and_potentials.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0102_feature_statistics_and_potentials.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-035-21138e35
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0102_packet_source_features.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0102_packet_source_features.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0102_packet_source_features.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-036-28e56da9
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0102_restore_weight_column.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0102_restore_weight_column.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0102_restore_weight_column.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-037-11519864
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0103_add_topology_and_noun_summaries.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0103_add_topology_and_noun_summaries.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0103_add_topology_and_noun_summaries.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-038-0887090f
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0103_unified_packet_source_features.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0103_unified_packet_source_features.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0103_unified_packet_source_features.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-039-d39fcc7f
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0104_packet_lineage_ulid_title.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0104_packet_lineage_ulid_title.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0104_packet_lineage_ulid_title.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-040-940cc3c1
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0105_latent64_vectors.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0105_latent64_vectors.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0105_latent64_vectors.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-041-b0385748
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0107_f_pagerank_topology_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0107_f_pagerank_topology_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0107_f_pagerank_topology_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-042-cd2cde87
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0109_phase109a_semantic_signals.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0109_phase109a_semantic_signals.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0109_phase109a_semantic_signals.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-043-0c73747b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0109_phase109a_semantic_signals_repair.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0109_phase109a_semantic_signals_repair.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0109_phase109a_semantic_signals_repair.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-044-46f3de7d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0110_dispatcher_audit_log.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0110_dispatcher_audit_log.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0110_dispatcher_audit_log.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-045-6098bbe6
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0110_phase109a_audit_trail.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0110_phase109a_audit_trail.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0110_phase109a_audit_trail.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-046-2f5f929b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0111_phase109a_soft_delete_safeguards.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0111_phase109a_soft_delete_safeguards.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0111_phase109a_soft_delete_safeguards.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-047-abef4507
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0111_phase111_evidence_ledgers.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0111_phase111_evidence_ledgers.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0111_phase111_evidence_ledgers.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-048-417bb94e
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0111_tool_call_runtime_contract.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0111_tool_call_runtime_contract.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0111_tool_call_runtime_contract.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-049-aca434b8
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0112_parent_atlas_graph_v2.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0112_parent_atlas_graph_v2.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0112_parent_atlas_graph_v2.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-050-9c3cf80b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0112_proposed_tool_calls.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0112_proposed_tool_calls.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0112_proposed_tool_calls.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-051-a8285aab
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0113_packet_jepa_metrics.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0113_packet_jepa_metrics.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0113_packet_jepa_metrics.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-052-4e4547ba
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0114_execution_reviews.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0114_execution_reviews.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0114_execution_reviews.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-053-a3a4aaea
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0114_semantic_topk_rerank_ledger.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0114_semantic_topk_rerank_ledger.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0114_semantic_topk_rerank_ledger.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-054-8a1c16a6
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0115_phase109a_workspace_revision_and_purge_audit.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0115_phase109a_workspace_revision_and_purge_audit.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0115_phase109a_workspace_revision_and_purge_audit.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-055-d45c7e28
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0116_phase109a_recommendation_supersession.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0116_phase109a_recommendation_supersession.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0116_phase109a_recommendation_supersession.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-056-b73075a3
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0117_recommendation_log_updated_by_trigger_fix.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0117_recommendation_log_updated_by_trigger_fix.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0117_recommendation_log_updated_by_trigger_fix.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-057-d189a482
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0118_semantic_lifecycle_events_recommendation_status.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0118_semantic_lifecycle_events_recommendation_status.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0118_semantic_lifecycle_events_recommendation_status.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-058-114571fd
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0150_unified_cross_ranker.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0150_unified_cross_ranker.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0150_unified_cross_ranker.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-059-51cc2f78
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0151_feature_label_mutation_audit.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0151_feature_label_mutation_audit.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0151_feature_label_mutation_audit.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-060-6d3c89f5
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0152_atlas_representations_registry.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0152_atlas_representations_registry.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0152_atlas_representations_registry.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-061-a1d61cf5
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0152_atlas_representations_registry_revised.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0152_atlas_representations_registry_revised.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0152_atlas_representations_registry_revised.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-062-657ebcde
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0153_atlas_context_manifests.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0153_atlas_context_manifests.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0153_atlas_context_manifests.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-063-3efe2517
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0154_atlas_packet_features_ast_provenance_columns.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0154_atlas_packet_features_ast_provenance_columns.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0154_atlas_packet_features_ast_provenance_columns.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-064-1e706c5d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0999_cluster_cards.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0999_cluster_cards.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0999_cluster_cards.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`
