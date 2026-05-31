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
// From sveltekit-frontend/src/lib/server/analytics/architectural-guard.ts
export * from '../../analytics/architectural-guard.js';

// From sveltekit-frontend/src/lib/server/analytics/codebase-research.ts
export * from '../../analytics/codebase-research.js';

// From sveltekit-frontend/src/lib/server/analytics/mapreduce-matrix-analysis.ts
export * from '../../analytics/mapreduce-matrix-analysis.js';

// From sveltekit-frontend/src/lib/server/analytics/research-cache.ts
export * from '../../analytics/research-cache.js';

// From sveltekit-frontend/src/lib/server/analytics/search-analytics.ts
export * from '../../analytics/search-analytics.js';

// From sveltekit-frontend/src/lib/server/analytics/unified-research-query.ts
export * from '../../analytics/unified-research-query.js';

// From sveltekit-frontend/src/lib/server/audit/api-audit-buffer.ts
export * from '../../audit/api-audit-buffer.js';
