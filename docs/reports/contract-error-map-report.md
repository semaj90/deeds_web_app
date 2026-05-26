# Cross-Layer Contract Error Map

Generated: 2026-05-26T03:58:39.647Z  |  Findings: 6  |  High: 0  Medium: 1  Low: 0  Info: 5

## Findings

### contract:drizzle-meta-documented_sidecar-001-3b35ccb8
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0013_codeintel_indexes.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0013_codeintel_indexes.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-002-f1ac684e
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0016_codeintel_schema.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0016_codeintel_schema.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-003-4b9906be
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0016_courtroom_3d_animation.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0016_courtroom_3d_animation.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-004-92d38fb9
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0018_output_meta_manifold4.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0018_output_meta_manifold4.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-005-827010f8
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "0019_llm_context_cache.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\0019_llm_context_cache.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-006-9d10ac6b
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "9999_agent_observations.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/9999_agent_observations.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\9999_agent_observations.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`
