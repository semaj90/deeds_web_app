# NES Command Center Scripts

This directory contains utility scripts for populating and managing the NES Command Center database.

## Available Scripts

### `scan-and-populate-routes.mjs`

Scans the `src/routes` directory and populates the `route_metadata` table with discovered routes.

**Usage:**
```bash
npm run scan:routes
```

**What it does:**
- Recursively scans `src/routes` for SvelteKit route files
- Extracts route metadata (path, kind, group, priority, badges)
- Upserts routes into the `route_metadata` table
- Handles both new routes and updates to existing routes

**Output:**
- Console summary showing success/error counts
- Database populated with route metadata
- Routes visible at http://localhost:5173/all-routes

---

### `import-error-logs.mjs`

Parses svelte-check output and populates the `error_cluster` table with categorized error data.

**Usage:**
```bash
# Import from default file (svelte-check-latest.txt)
npm run import:errors

# Import from specific file
npm run import:errors svelte-check-top1000.txt
```

**What it does:**
- Parses svelte-check error output format
- Categorizes errors (type-mismatch, missing-import, svelte5-migration, etc.)
- Groups similar errors into clusters
- Tracks affected routes and occurrence counts
- Upserts clusters into the `error_cluster` table

**Error Categories:**
- `type-mismatch` - TypeScript type incompatibility
- `missing-import` - Cannot find module/file
- `missing-property` - Property does not exist on type
- `unused-code` - Unused variables/imports
- `deprecated` - Deprecated API usage
- `svelte5-migration` - Svelte 5 runes/migration issues
- `async-issue` - Promise/async handling problems
- `null-safety` - Null/undefined issues
- `other` - Uncategorized errors

**Output:**
- Console summary showing parsed errors and clusters
- Database populated with error clusters
- Errors visible at http://localhost:5173/all-routes (enriched route data)

---

## Environment

All scripts require:
- `DATABASE_URL` environment variable or defaults to `postgresql://legal_admin:123456@localhost:5434/legal_ai_db`
- PostgreSQL with NES Command Center tables created (see migration: `drizzle/migrations/20251221_add_nes_command_center_tables.sql`)

## Development

All scripts use ES modules (`.mjs`) and can be run directly with Node.js:

```bash
node scripts/scan-and-populate-routes.mjs
node scripts/import-error-logs.mjs [logfile]
```

## Workflow

1. **Scan routes** to populate route metadata:
   ```bash
   npm run scan:routes
   ```

2. **Import errors** to populate error clusters:
   ```bash
   npm run import:errors
   ```

3. **View enriched data** at http://localhost:5173/all-routes
