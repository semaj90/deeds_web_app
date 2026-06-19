# Cross-Layer Contract Error Map

Generated: 2026-06-19T05:26:46.604Z  |  Findings: 1  |  High: 0  Medium: 1  Low: 0  Info: 0

## Findings

### contract:drizzle-meta-stale_migration-001-cd7c3536
**Severity:** medium  |  **Layer:** drizzle-meta  |  **HMM State:** `stale_migration`

**Problem:** "0099_atlas_svg_glyphs.sql" is not in drizzle/meta/_journal.json and is not listed in drizzle/sidecar-migrations.json — drizzle-kit migrate will skip it.

**Expected:** Every numbered .sql in drizzle/ must be journaled OR listed as a documented sidecar.

**Suggested Fix:** Either apply manually (docker exec -i legal-ai-postgres psql ... < sveltekit-frontend/drizzle/0099_atlas_svg_glyphs.sql) and add to sidecar-migrations.json, or regenerate with drizzle-kit generate.

**Files:** `sveltekit-frontend\drizzle\0099_atlas_svg_glyphs.sql`

**Validation:** `npm run audit:drizzle-meta`, `npm run db:check`
