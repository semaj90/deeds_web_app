# Cross-Layer Contract Error Map

Generated: 2026-11-09T23:17:34.524Z  |  Findings: 66  |  High: 0  Medium: 38  Low: 2  Info: 26

## Findings

### contract:sveltekit-route-route_contract_mismatch-001-86cb947b
**Severity:** low  |  **Layer:** sveltekit-route  |  **HMM State:** `route_contract_mismatch`

**Problem:** GET route returns 500 status code. The degraded-path contract prefers 200 with { data: [], error: msg }.

**Expected:** GET routes return 200 with empty arrays/nulls matching success shape.

**Suggested Fix:** Replace `return json({ error }, { status: 500 })` with `return json({ data: [], error: msg })` (status 200).

**Files:** `sveltekit-frontend\src\routes\api\cases\[id]\scenes\[sceneKey]\markers\+server.ts`

**Validation:** `npm run audit:contracts`

### contract:sveltekit-route-route_contract_mismatch-002-86cb947b
**Severity:** low  |  **Layer:** sveltekit-route  |  **HMM State:** `route_contract_mismatch`

**Problem:** GET route returns 500 status code. The degraded-path contract prefers 200 with { data: [], error: msg }.

**Expected:** GET routes return 200 with empty arrays/nulls matching success shape.

**Suggested Fix:** Replace `return json({ error }, { status: 500 })` with `return json({ data: [], error: msg })` (status 200).

**Files:** `sveltekit-frontend\src\routes\api\cases\[id]\scenes\[sceneId]\revisions\+server.ts`

**Validation:** `npm run audit:contracts`

### contract:drizzle-meta-documented_sidecar-003-26dda09a
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0019_bm25_search_vector.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0019_bm25_search_vector.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-004-6c8a6ec1
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0023_vector_index_registry.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0023_vector_index_registry.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-005-c908a1c7
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0035_create_atlas_feature_packets.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0035_create_atlas_feature_packets.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-006-5bd90b15
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0042_unified_registry_enrichment_projections.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0042_unified_registry_enrichment_projections.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-007-2a5fba98
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0043_atlas_packet_features_schema.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0043_atlas_packet_features_schema.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-008-88d9df2d
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0043_feature_extraction_tables.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0043_feature_extraction_tables.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-009-5dfeeab7
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0044_phase_107_feature_layer_schema.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0044_phase_107_feature_layer_schema.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-010-8d068f3d
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0046_phase_109_unknown_packets.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0046_phase_109_unknown_packets.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-011-d328ecc9
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0052_evaluation_corpus.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0052_evaluation_corpus.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-012-edb3459e
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0054_evaluation_corpora.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0054_evaluation_corpora.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-013-f00af80a
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0055_evaluation_results.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0055_evaluation_results.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-014-c6be2170
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0056_evaluation_evidence.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0056_evaluation_evidence.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-015-70f6f462
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0058_evaluation_relevance_corrected.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0058_evaluation_relevance_corrected.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-016-829576e4
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0059_qdrant_point_id_backfill_tables.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0059_qdrant_point_id_backfill_tables.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-017-4e5035ec
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0060_feature_envelope_column.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0060_feature_envelope_column.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-018-57b36a33
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0099_atlas_svg_glyphs.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0099_atlas_svg_glyphs.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-019-a4c26a2c
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0100_atlas_feature_vectors.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0100_atlas_feature_vectors.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-020-0d28dc7e
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0102_packet_source_features.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0102_packet_source_features.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-021-a7bc4005
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0103_add_topology_and_noun_summaries.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0103_add_topology_and_noun_summaries.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-022-49ac0ced
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0103_unified_packet_source_features.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0103_unified_packet_source_features.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-023-42de1f0f
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0109_phase109a_semantic_signals.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0109_phase109a_semantic_signals.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-024-29dd4cfe
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0109_phase109a_semantic_signals_repair.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0109_phase109a_semantic_signals_repair.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-025-55c708c4
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0112_parent_atlas_graph_v2.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0112_parent_atlas_graph_v2.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-026-75067054
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0114_semantic_topk_rerank_ledger.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0114_semantic_topk_rerank_ledger.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-027-ea5ba189
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0153_atlas_context_manifests.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0153_atlas_context_manifests.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-028-d08c1dbd
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0999_cluster_cards.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0999_cluster_cards.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-029-6f4602d2
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0019_atlas_packet_indexes_gin.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0019_atlas_packet_indexes_gin.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0019_atlas_packet_indexes_gin.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-030-68651803
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0020_fix_packet_feature_metrics_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0020_fix_packet_feature_metrics_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0020_fix_packet_feature_metrics_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-031-a99f92ab
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0020_phase10_packet_ontology.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0020_phase10_packet_ontology.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0020_phase10_packet_ontology.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-032-ee4af613
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0020_promotion_outbox.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0020_promotion_outbox.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0020_promotion_outbox.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-033-4ee9f3c7
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0045_phase_108e_schema_alignment.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0045_phase_108e_schema_alignment.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0045_phase_108e_schema_alignment.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-034-a3dd36d9
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0048_query_cache_metrics.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0048_query_cache_metrics.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0048_query_cache_metrics.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-035-3c91523d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0053_evaluation_corpus_queries.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0053_evaluation_corpus_queries.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0053_evaluation_corpus_queries.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-036-76cbbc9f
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0057_evaluation_relevance.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0057_evaluation_relevance.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0057_evaluation_relevance.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-037-c47e2d28
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0099_agentic_identity_recovery.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0099_agentic_identity_recovery.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0099_agentic_identity_recovery.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-038-5e8aea15
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0099_unified_id_hierarchy.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0099_unified_id_hierarchy.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0099_unified_id_hierarchy.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-039-c59f32b4
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0100_identity_lane_recovery.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0100_identity_lane_recovery.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0100_identity_lane_recovery.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-040-4efb57ff
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0100_retrieval_events_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0100_retrieval_events_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0100_retrieval_events_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-041-72e7a41b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_encoder_provenance_gate2.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_encoder_provenance_gate2.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_encoder_provenance_gate2.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-042-af1f87b6
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_packet_ast_keyword_features.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_packet_ast_keyword_features.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_packet_ast_keyword_features.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-043-32b1cdcb
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_packet_ontology_tuples.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_packet_ontology_tuples.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_packet_ontology_tuples.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-044-74a5420c
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0101_spec_control_plane_phase1.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0101_spec_control_plane_phase1.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0101_spec_control_plane_phase1.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-045-0245a68c
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0102_feature_statistics_and_potentials.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0102_feature_statistics_and_potentials.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0102_feature_statistics_and_potentials.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-046-28e56da9
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0102_restore_weight_column.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0102_restore_weight_column.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0102_restore_weight_column.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-047-d39fcc7f
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0104_packet_lineage_ulid_title.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0104_packet_lineage_ulid_title.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0104_packet_lineage_ulid_title.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-048-940cc3c1
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0105_latent64_vectors.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0105_latent64_vectors.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0105_latent64_vectors.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-049-b0385748
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0107_f_pagerank_topology_schema.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0107_f_pagerank_topology_schema.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0107_f_pagerank_topology_schema.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-050-46f3de7d
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0110_dispatcher_audit_log.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0110_dispatcher_audit_log.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0110_dispatcher_audit_log.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-051-6098bbe6
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0110_phase109a_audit_trail.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0110_phase109a_audit_trail.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0110_phase109a_audit_trail.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-052-2f5f929b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0111_phase109a_soft_delete_safeguards.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0111_phase109a_soft_delete_safeguards.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0111_phase109a_soft_delete_safeguards.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-053-abef4507
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0111_phase111_evidence_ledgers.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0111_phase111_evidence_ledgers.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0111_phase111_evidence_ledgers.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-054-417bb94e
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0111_tool_call_runtime_contract.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0111_tool_call_runtime_contract.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0111_tool_call_runtime_contract.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-055-9c3cf80b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0112_proposed_tool_calls.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0112_proposed_tool_calls.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0112_proposed_tool_calls.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-056-a8285aab
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0113_packet_jepa_metrics.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0113_packet_jepa_metrics.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0113_packet_jepa_metrics.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-057-4e4547ba
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0114_execution_reviews.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0114_execution_reviews.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0114_execution_reviews.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-058-8a1c16a6
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0115_phase109a_workspace_revision_and_purge_audit.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0115_phase109a_workspace_revision_and_purge_audit.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0115_phase109a_workspace_revision_and_purge_audit.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-059-d45c7e28
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0116_phase109a_recommendation_supersession.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0116_phase109a_recommendation_supersession.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0116_phase109a_recommendation_supersession.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-060-b73075a3
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0117_recommendation_log_updated_by_trigger_fix.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0117_recommendation_log_updated_by_trigger_fix.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0117_recommendation_log_updated_by_trigger_fix.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-061-d189a482
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0118_semantic_lifecycle_events_recommendation_status.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0118_semantic_lifecycle_events_recommendation_status.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0118_semantic_lifecycle_events_recommendation_status.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-062-114571fd
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0150_unified_cross_ranker.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0150_unified_cross_ranker.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0150_unified_cross_ranker.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-063-51cc2f78
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0151_feature_label_mutation_audit.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0151_feature_label_mutation_audit.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0151_feature_label_mutation_audit.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-064-6d3c89f5
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0152_atlas_representations_registry.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0152_atlas_representations_registry.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0152_atlas_representations_registry.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-065-a1d61cf5
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0152_atlas_representations_registry_revised.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0152_atlas_representations_registry_revised.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0152_atlas_representations_registry_revised.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`

### contract:drizzle-meta-stale_migration-066-3efe2517
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0154_atlas_packet_features_ast_provenance_columns.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0154_atlas_packet_features_ast_provenance_columns.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0154_atlas_packet_features_ast_provenance_columns.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`
