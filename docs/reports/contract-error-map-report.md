# Cross-Layer Contract Error Map

Generated: 2026-05-16T08:03:58.638Z  |  Findings: 5  |  High: 0  Medium: 5  Low: 0

## Findings

### contract:drizzle-meta-stale_migration-001-0812ab40
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Migration file "0013_codeintel_indexes.sql" is not recorded in drizzle/meta/_journal.json — drizzle-kit migrate will skip it.

**Expected:** All .sql files in drizzle/ should appear in the journal unless they are manually applied sidecars.

**Suggested Fix:** Apply manually: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0013_codeintel_indexes.sql` or add to journal.

**Files:** `sveltekit-frontend\drizzle\0013_codeintel_indexes.sql`

**Validation:** `npm run db:check`

### contract:drizzle-meta-stale_migration-002-f4118df0
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Migration file "0016_codeintel_schema.sql" is not recorded in drizzle/meta/_journal.json — drizzle-kit migrate will skip it.

**Expected:** All .sql files in drizzle/ should appear in the journal unless they are manually applied sidecars.

**Suggested Fix:** Apply manually: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0016_codeintel_schema.sql` or add to journal.

**Files:** `sveltekit-frontend\drizzle\0016_codeintel_schema.sql`

**Validation:** `npm run db:check`

### contract:drizzle-meta-stale_migration-003-bb28a111
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Migration file "0016_courtroom_3d_animation.sql" is not recorded in drizzle/meta/_journal.json — drizzle-kit migrate will skip it.

**Expected:** All .sql files in drizzle/ should appear in the journal unless they are manually applied sidecars.

**Suggested Fix:** Apply manually: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0016_courtroom_3d_animation.sql` or add to journal.

**Files:** `sveltekit-frontend\drizzle\0016_courtroom_3d_animation.sql`

**Validation:** `npm run db:check`

### contract:drizzle-meta-stale_migration-004-6b74e3c0
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Migration file "0018_output_meta_manifold4.sql" is not recorded in drizzle/meta/_journal.json — drizzle-kit migrate will skip it.

**Expected:** All .sql files in drizzle/ should appear in the journal unless they are manually applied sidecars.

**Suggested Fix:** Apply manually: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0018_output_meta_manifold4.sql` or add to journal.

**Files:** `sveltekit-frontend\drizzle\0018_output_meta_manifold4.sql`

**Validation:** `npm run db:check`

### contract:drizzle-meta-stale_migration-005-40a25c16
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Migration file "0019_llm_context_cache.sql" is not recorded in drizzle/meta/_journal.json — drizzle-kit migrate will skip it.

**Expected:** All .sql files in drizzle/ should appear in the journal unless they are manually applied sidecars.

**Suggested Fix:** Apply manually: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0019_llm_context_cache.sql` or add to journal.

**Files:** `sveltekit-frontend\drizzle\0019_llm_context_cache.sql`

**Validation:** `npm run db:check`
