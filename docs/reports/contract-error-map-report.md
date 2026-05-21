# Cross-Layer Contract Error Map

Generated: 2026-05-21T02:39:53.085Z  |  Findings: 5  |  High: 0  Medium: 0  Low: 5

## Findings

### contract:drizzle-meta-stale_migration-001-d6a201cf
**Severity:** low  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Documented sidecar "0013_codeintel_indexes.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied: see validationCommand in sidecar-migrations.json.

**Files:** `sveltekit-frontend\drizzle\0013_codeintel_indexes.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-002-033419d2
**Severity:** low  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Documented sidecar "0016_codeintel_schema.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied: see validationCommand in sidecar-migrations.json.

**Files:** `sveltekit-frontend\drizzle\0016_codeintel_schema.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-003-3f91ba5e
**Severity:** low  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Documented sidecar "0016_courtroom_3d_animation.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied: see validationCommand in sidecar-migrations.json.

**Files:** `sveltekit-frontend\drizzle\0016_courtroom_3d_animation.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-004-1486163b
**Severity:** low  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Documented sidecar "0018_output_meta_manifold4.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied: see validationCommand in sidecar-migrations.json.

**Files:** `sveltekit-frontend\drizzle\0018_output_meta_manifold4.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-stale_migration-005-187064cc
**Severity:** low  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** Documented sidecar "0019_llm_context_cache.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied: see validationCommand in sidecar-migrations.json.

**Files:** `sveltekit-frontend\drizzle\0019_llm_context_cache.sql`

**Validation:** `npm run audit:drizzle-meta`
