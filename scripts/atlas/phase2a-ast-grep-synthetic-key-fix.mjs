#!/usr/bin/env node
/**
 * Repo-root wrapper for the canonical Phase 2A ast-grep backfill script.
 *
 * The active implementation lives under:
 *   sveltekit-frontend/scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs
 *
 * This wrapper exists so the npm scripts in sveltekit-frontend/package.json
 * can continue to point at ../scripts/atlas/... without diverging from the
 * canonical implementation.
 */

import '../../sveltekit-frontend/scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs';
