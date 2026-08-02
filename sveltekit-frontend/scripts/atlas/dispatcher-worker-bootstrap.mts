#!/usr/bin/env node
/**
 * scripts/atlas/dispatcher-worker-bootstrap.mts
 * ===============================================
 * Thin bootstrap — its ONLY job is loading .env into process.env before
 * anything ENV-dependent gets imported, then handing off to the real
 * runtime.
 *
 * Why this file exists as a separate module (operator review, 2026-08-01):
 * a single-file version previously called loadRuntimeEnv() at top-level
 * before the rest of its own code, with a comment claiming that ordering
 * guaranteed env loaded first. That claim was correct FOR THAT FILE (its
 * only static imports were fs/promises, path, url — nothing ENV-touching;
 * every ENV-dependent module was behind `await import()` inside main(),
 * which only runs after the synchronous loadRuntimeEnv() call completes)
 * — proven live: the DB client logged its real Postgres target and the
 * Redis heartbeat authenticated correctly after the fix. But relying on
 * "nothing above this line touches ENV" as an invariant is fragile — any
 * future static `import` added above the call (even indirectly, via an
 * import that itself does something ENV-dependent at module-eval time)
 * silently breaks it, and ESM hoists+evaluates all static imports before
 * a module's own body runs regardless of where they appear in the file.
 * Splitting into a bootstrap that does nothing BUT load env, then dynamic-
 * imports the runtime, makes "env loads first" structural rather than a
 * comment-enforced convention.
 *
 * Usage:
 *   npm run atlas:dispatcher:worker              # normal
 *   npm run atlas:dispatcher:worker -- --dry-run  # validate + compile, no consumer
 *   npm run atlas:dispatcher:worker -- --smoke    # start, confirm ready, self-shutdown, exit 0
 */

import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';

loadRuntimeEnv();

await import('./dispatcher-worker-runtime.mts');
