# Cross-Layer Contract Error Map

Generated: 2026-06-01T18:20:28.788Z  |  Findings: 8  |  High: 0  Medium: 0  Low: 0  Info: 8

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

### contract:drizzle-meta-documented_sidecar-006-163be963
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "9998_create_agent_pickup_queue.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\9998_create_agent_pickup_queue.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-007-65c917c7
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "9999_agent_observations.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\9999_agent_observations.sql`

**Validation:** `npm run audit:drizzle-meta`

### contract:drizzle-meta-documented_sidecar-008-692ac40a
**Severity:** info  |  **Layer:** drizzle-meta  |  **HMM State:** `documented_sidecar`

**Problem:** Documented sidecar "9999_create_task_semantic_packets.sql" not in _journal.json (intentional — see drizzle/sidecar-migrations.json).

**Expected:** Sidecar migrations are applied manually and excluded from the journal by design.

**Suggested Fix:** No action required — verify it was applied, or promote it into drizzle/meta/_journal.json if it should become a first-class migration.

**Files:** `sveltekit-frontend\drizzle\9999_create_task_semantic_packets.sql`

**Validation:** `npm run audit:drizzle-meta`
