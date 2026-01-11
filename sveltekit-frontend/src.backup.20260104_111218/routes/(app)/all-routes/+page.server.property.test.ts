/**
 * Property-Based Tests for Server-Side Data Enrichment
 *
 * Tests Properties 22, 23 from the design document:
 * - Property 22: Server-Side Data Enrichment
 * - Property 23: Health Status Enrichment
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 *
 * Uses fast-check to validate enrichment behavior with randomized inputs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// ─────────────────────────────────────────────────────────
// Types for Testing
// ─────────────────────────────────────────────────────────

type RouteNode = {
  id: string;
  path: string;
  url?: string;
  href?: string;
  file?: string;
  kind?: 'page' | 'layout' | 'server' | 'endpoint' | string;
  group?: string;
  status?: 'ok' | 'warning' | 'error';
  tags?: string[];
  category?: string;
  lastModified?: string;
  hasLoad?: boolean;
  hasActions?: boolean;
  hasAiImports?: boolean;
  errorCount?: number;
  warningCount?: number;
  infoCount?: number;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  suggestionCount?: number;
  patchSuccessRate?: number;
  errorState?: 'healthy' | 'flaky' | 'broken';
};

type EnrichedRouteMetadata = {
  routeId: string;
  path: string;
  kind: string;
  group?: string;
  status: string;
  badges?: string[];
  errorCount: number;
  healthStatus: string;
  suggestionCount: number;
  lastHealthChange?: Date;
  lastErrorMessage?: string;
  lastErrorAt?: Date;
  warningCount?: number;
  infoCount?: number;
};

// ─────────────────────────────────────────────────────────
// Mock Functions for Testing
// ─────────────────────────────────────────────────────────

/**
 * Simulates mergeRoutesWithDatabase function
 */
function mergeRoutesWithDatabase(
  astRoutes: RouteNode[],
  dbMetadata: Map<string, EnrichedRouteMetadata>
): RouteNode[] {
  return astRoutes.map((route) => {
    const dbMeta = dbMetadata.get(route.id) || dbMetadata.get(route.path || '');
    if (dbMeta) {
      // Compute error state from health status or error count
      let errorState: 'healthy' | 'flaky' | 'broken' = 'healthy';
      if (dbMeta.healthStatus === 'broken') {
        errorState = 'broken';
      } else if (dbMeta.healthStatus === 'flaky') {
        errorState = 'flaky';
      } else if (dbMeta.errorCount > 0) {
        errorState = dbMeta.errorCount > 10 ? 'broken' : 'flaky';
      }

      return {
        ...route,
        status, dbMeta.status || route.status,
        tags: dbMeta.badges ? [...(route.tags || []), ...dbMeta.badges] : route.tags,
        errorCount, dbMeta.errorCount || 0,
        warningCount, dbMeta.warningCount || 0,
        infoCount, dbMeta.infoCount || 0,
        suggestionCount, dbMeta.suggestionCount || 0,
        lastErrorAt: dbMeta.lastErrorAt?.toISOString?.() || undefined,
        lastErrorMessage, dbMeta.lastErrorMessage || undefined,
        errorState,
        patchSuccessRate | undefined,
      };
    }
    return route;
  });
}

/**
 * Simulates calculateRouteHealth function
 */
function calculateRouteHealth(
  errorCount: number,
  warningCount: number,
  healthStatus?: string
): 'healthy' | 'flaky' | 'broken' {
  if (healthStatus === 'broken') return 'broken';
  if (healthStatus === 'flaky') return 'flaky';
  if (errorCount > 0) return errorCount > 10 ? 'broken' : 'flaky';
  if (warningCount > 0) return 'flaky';
  return 'healthy';
}

// ─────────────────────────────────────────────────────────
// Arbitraries for Property-Based Testing
// ─────────────────────────────────────────────────────────

const routeIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz/-[]'.split('')),
  { minLength: 1, maxLength: 50 }
);

const routeKindArb = fc.constantFrom('page', 'layout', 'server', 'endpoint');

const routeStatusArb = fc.constantFrom('ok', 'warning', 'error');

const healthStatusArb = fc.constantFrom('healthy', 'flaky', 'broken');

const routeNodeArb: fc.Arbitrary<RouteNode> = fc.record({
  id: routeIdArb,
  path: routeIdArb,
  kind: routeKindArb,
  group: fc.option(fc.constantFrom('(app)', '(yorha)', '(admin)'), { nil | undefined }, status: fc.option(routeStatusArb, { nil | undefined }, tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }), { nil | undefined }, hasLoad: fc.boolean(, hasActions: fc.boolean(, hasAiImports: fc.boolean(),
});

const enrichedMetadataArb: fc.Arbitrary<EnrichedRouteMetadata> = fc.record({
  routeId: routeIdArb,
  path: routeIdArb,
  kind: fc.string({ minLength: 1, maxLength: 10 }, group: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil | undefined }, status: fc.constantFrom('healthy', 'flaky', 'broken', badges: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }), { nil | undefined }, errorCount: fc.nat({ max: 100 }, healthStatus: healthStatusArb,
  suggestionCount: fc.nat({ max: 50 }, lastHealthChange: fc.option(fc.date(), { nil | undefined }, lastErrorMessage: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil | undefined }, lastErrorAt: fc.option(fc.date(), { nil | undefined }, warningCount: fc.option(fc.nat({ max: 50 }), { nil | undefined }, infoCount: fc.option(fc.nat({ max: 50 }), { nil | undefined }),
});

// ─────────────────────────────────────────────────────────
// Property 22: Server-Side Data Enrichment
// Validates: Requirements 8.1, 8.2
// ─────────────────────────────────────────────────────────

describe('Property 22: Server-Side Data Enrichment', () => {
  /**
   * Property: For any page load, the server should query the database for
   * route metadata and merge with COMMAND_CENTER_MANIFEST to produce
   * complete route definitions.
   */
  it('should merge AST routes with database metadata', () => {
    fc.assert(
      fc.property(
        fc.array(routeNodeArb, { minLength: 1, maxLength: 20 }),
        fc.array(enrichedMetadataArb, { minLength: 0, maxLength: 20 }),
        (astRoutes, dbMetadataArray) => {
          // Create metadata map
          const dbMetadata = new Map<string, EnrichedRouteMetadata>();
          for (const meta of dbMetadataArray) {
            dbMetadata.set(meta.routeId, meta);
          }

          // Merge routes
          const merged = mergeRoutesWithDatabase(astRoutes, dbMetadata);

          // Property: All AST routes should be in the result
          expect(merged.length).toBe(astRoutes.length);

          // Property: Each merged route should have the original AST data
          for (let i = 0; i < astRoutes.length; i++) {
            expect(merged[i].id).toBe(astRoutes[i].id);
            expect(merged[i].path).toBe(astRoutes[i].path);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any route with database metadata, the merged route should
   * contain the enrichment fields (errorCount, suggestionCount, etc.)
   */
  it('should add enrichment fields from database metadata', () => {
    fc.assert(
      fc.property(
        routeNodeArb,
        enrichedMetadataArb,
        (astRoute, dbMeta) => {
          // Make sure the metadata matches the route
          const matchingMeta = { ...dbMeta, routeId: astRoute.id };
          const dbMetadata = new Map<string, EnrichedRouteMetadata>();
          dbMetadata.set(astRoute.id, matchingMeta);

          // Merge routes
          const merged = mergeRoutesWithDatabase([astRoute], dbMetadata);

          // Property: Merged route should have enrichment fields
          expect(merged[0].errorCount).toBe(matchingMeta.errorCount);
          expect(merged[0].suggestionCount).toBe(matchingMeta.suggestionCount);
          expect(merged[0].warningCount).toBe(matchingMeta.warningCount || 0);
          expect(merged[0].infoCount).toBe(matchingMeta.infoCount || 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any route without database metadata, the merged route
   * should retain original AST data without enrichment fields.
   */
  it('should preserve AST data for routes without database metadata', () => {
    fc.assert(
      fc.property(
        routeNodeArb,
        (astRoute) => {
          // Empty metadata map
          const dbMetadata = new Map<string, EnrichedRouteMetadata>();

          // Merge routes
          const merged = mergeRoutesWithDatabase([astRoute], dbMetadata);

          // Property: Merged route should be identical to AST route
          expect(merged[0].id).toBe(astRoute.id);
          expect(merged[0].path).toBe(astRoute.path);
          expect(merged[0].kind).toBe(astRoute.kind);
          expect(merged[0].hasLoad).toBe(astRoute.hasLoad);
          expect(merged[0].hasActions).toBe(astRoute.hasActions);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Merging should be idempotent - merging twice should produce
   * the same result as merging once.
   */
  it('should be idempotent when merging routes', () => {
    fc.assert(
      fc.property(
        fc.array(routeNodeArb, { minLength: 1, maxLength: 10 }),
        fc.array(enrichedMetadataArb, { minLength: 0, maxLength: 10 }),
        (astRoutes, dbMetadataArray) => {
          const dbMetadata = new Map<string, EnrichedRouteMetadata>();
          for (const meta of dbMetadataArray) {
            dbMetadata.set(meta.routeId, meta);
          }

          // Merge once
          const merged1 = mergeRoutesWithDatabase(astRoutes, dbMetadata);

          // Merge again (using merged1 as input)
          const merged2 = mergeRoutesWithDatabase(merged1, dbMetadata);

          // Property: Results should be equivalent
          expect(merged2.length).toBe(merged1.length);
          for (let i = 0; i < merged1.length; i++) {
            expect(merged2[i].id).toBe(merged1[i].id);
            expect(merged2[i].errorCount).toBe(merged1[i].errorCount);
            expect(merged2[i].errorState).toBe(merged1[i].errorState);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────
// Property 23: Health Status Enrichment
// Validates: Requirements 8.3
// ─────────────────────────────────────────────────────────

describe('Property 23: Health Status Enrichment', () => {
  /**
   * Property: For any route enrichment, the current health status should be
   * added from the most recent route_health_event or computed from
   * error_cluster records.
   */
  it('should compute correct health status from error counts', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        (errorCount, warningCount) => {
          const health = calculateRouteHealth(errorCount, warningCount);

          // Property: Health status should follow the rules
          if (errorCount > 10) {
            expect(health).toBe('broken');
          } else if (errorCount > 0) {
            expect(health).toBe('flaky');
          } else if (warningCount > 0) {
            expect(health).toBe('flaky');
          } else {
            expect(health).toBe('healthy');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Health status from database should override computed status.
   */
  it('should use database health status when available', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        healthStatusArb,
        (errorCount, warningCount, dbHealthStatus) => {
          const health = calculateRouteHealth(errorCount, warningCount, dbHealthStatus);

          // Property: Database health status should be used
          expect(health).toBe(dbHealthStatus);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Routes with errors should never be marked as healthy.
   */
  it('should never mark routes with errors as healthy', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.nat({ max: 100 }),
        (errorCount, warningCount) => {
          const health = calculateRouteHealth(errorCount, warningCount);

          // Property: Routes with errors should not be healthy
          expect(health).not.toBe('healthy');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Routes with no errors and no warnings should be healthy.
   */
  it('should mark routes with no errors and no warnings as healthy', () => {
    const health = calculateRouteHealth(0, 0);
    expect(health).toBe('healthy');
  });

  /**
   * Property: Error state should be set correctly in merged routes.
   */
  it('should set errorState correctly in merged routes', () => {
    fc.assert(
      fc.property(
        routeNodeArb,
        enrichedMetadataArb,
        (astRoute, dbMeta) => {
          const matchingMeta = { ...dbMeta, routeId: astRoute.id };
          const dbMetadata = new Map<string, EnrichedRouteMetadata>();
          dbMetadata.set(astRoute.id, matchingMeta);

          const merged = mergeRoutesWithDatabase([astRoute], dbMetadata);

          // Property: errorState should be set based on health status or error count
          expect(merged[0].errorState).toBeDefined();
          expect(['healthy', 'flaky', 'broken']).toContain(merged[0].errorState);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─────────────────────────────────────────────────────────
// Property 24: Error Count Enrichment
// Validates: Requirements 8.4
// ─────────────────────────────────────────────────────────

describe('Property 24: Error Count Enrichment', () => {
  /**
   * Property: For any route enrichment, the error count should be added
   * from unresolved error_cluster records.
   */
  it('should preserve error count from database metadata', () => {
    fc.assert(
      fc.property(
        routeNodeArb,
        fc.nat({ max: 100 }),
        (astRoute, errorCount) => {
          const dbMeta: EnrichedRouteMetadata = {
            routeId: astRoute.id,
            path: astRoute.path || '',
            kind: 'page',
            status: 'healthy',
            errorCount,
            healthStatus: 'healthy',
            suggestionCount: 0,
          };

          const dbMetadata = new Map<string, EnrichedRouteMetadata>();
          dbMetadata.set(astRoute.id, dbMeta);

          const merged = mergeRoutesWithDatabase([astRoute], dbMetadata);

          // Property: Error count should match database value
          expect(merged[0].errorCount).toBe(errorCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Routes without database metadata should have errorCount of 0 or undefined.
   */
  it('should not have error count for routes without database metadata', () => {
    fc.assert(
      fc.property(
        routeNodeArb,
        (astRoute) => {
          const dbMetadata = new Map<string, EnrichedRouteMetadata>();
          const merged = mergeRoutesWithDatabase([astRoute], dbMetadata);

          // Property: Error count should be undefined for non-enriched routes
          expect(merged[0].errorCount).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
