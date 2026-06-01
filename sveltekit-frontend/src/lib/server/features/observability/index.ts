/**
 * observability feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: Observability: analytics, audit, telemetry, RL feedback
 * Confidence: high
 * Generated: 2026-05-30T18:09:34.025Z
 *
 * Scattered sources:
 *   - sveltekit-frontend/src/lib/server/analytics
 *   - sveltekit-frontend/src/lib/server/audit
 */
// From sveltekit-frontend/src/lib/server/features/observability/architectural-guard.ts
export * from './architectural-guard.js';

// From sveltekit-frontend/src/lib/server/features/observability/codebase-research.ts
export * from './codebase-research.js';

// From sveltekit-frontend/src/lib/server/features/observability/mapreduce-matrix-analysis.ts
export * from './mapreduce-matrix-analysis.js';

// From sveltekit-frontend/src/lib/server/features/observability/research-cache.ts
export * from './research-cache.js';

// From sveltekit-frontend/src/lib/server/features/observability/search-analytics.ts
export * from './search-analytics.js';

// From sveltekit-frontend/src/lib/server/features/observability/unified-research-query.ts
export * from './unified-research-query.js';

// From sveltekit-frontend/src/lib/server/features/observability/api-audit-buffer.ts
export * from './api-audit-buffer.js';
