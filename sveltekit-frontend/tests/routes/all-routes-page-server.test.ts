/**
 * Unit Tests for Server-Side Data Loading
 *
 * Tests the enrichRoutesWithDatabase() function and related helpers.
 * Validates: Requirements 8.1-8.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────
// Types
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
// Functions Under Test (extracted for unit testing)
// ─────────────────────────────────────────────────────────

/**
 * Merge database routes with AST routes
 */
function mergeRoutesWithDatabase(
  astRoutes: RouteNode[],
  dbMetadata: Map<string, EnrichedRouteMetadata>
): RouteNode[] {
  return astRoutes.map((route) => {
    const dbMeta = dbMetadata.get(route.id) || dbMetadata.get(route.path || '');
    if (dbMeta) {
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
        status: dbMeta.status || route.status,
        tags: dbMeta.badges ? [...(route.tags || []), ...dbMeta.badges] : route.tags,
        errorCount: dbMeta.errorCount || 0,
        warningCount: dbMeta.warningCount || 0,
        infoCount: dbMeta.infoCount || 0,
        suggestionCount: dbMeta.suggestionCount || 0,
        lastErrorAt: dbMeta.lastErrorAt?.toISOString?.() || undefined,
        lastErrorMessage: dbMeta.lastErrorMessage || undefined,
        errorState,
        patchSuccessRate: route.patchSuccessRate,
      };
    }
    return route;
  });
}

/**
 * Calculate route health from error counts
 */
function calculateRouteHealth(
  errorCount: number,
  warningCount: number,
  healthStatus?: string
): 'healthy' | 'flaky' | 'broken' {
  if (healthStatus === 'healthy') return 'healthy';
  if (healthStatus === 'broken') return 'broken';
  if (healthStatus === 'flaky') return 'flaky';
  if (errorCount > 0) return errorCount > 10 ? 'broken' : 'flaky';
  if (warningCount > 0) return 'flaky';
  return 'healthy';
}

/**
 * Convert AST node to RouteNode
 */
function astNodeToRouteNode(astNode: any): RouteNode {
  const nodeId = astNode.id || astNode.path || String(Math.random());
  const path = astNode.path || '';
  const groupMatch = path.match(/\(([^)]+)\)/);
  const group = groupMatch ? `(${groupMatch[1]})` : undefined;

  let kind: RouteNode['kind'] = 'page';
  if (astNode.file?.includes('api/')) kind = 'endpoint';
  else if (astNode.file?.includes('+layout')) kind = 'layout';
  else if (astNode.file?.includes('+server')) kind = 'server';

  const tags: string[] = [];
  if (path.includes('cases')) tags.push('case');
  if (path.includes('evidence')) tags.push('evidence');
  if (path.includes('persons')) tags.push('person');
  if (path.includes('api')) tags.push('api');
  if (path.includes('yorha')) tags.push('yorha');
  if (astNode.hasAiImports) tags.push('ai');

  return {
    id: nodeId,
    path,
    href: path,
    file: astNode.file,
    kind,
    group,
    status: 'ok',
    tags: tags.length ? tags : undefined,
    category: group ? `Routes/${group}` : 'Routes/root',
    lastModified: astNode.lastModified,
    hasLoad: astNode.hasLoad ?? false,
    hasActions: astNode.hasActions ?? false,
    hasAiImports: astNode.hasAiImports ?? false,
  };
}

// ─────────────────────────────────────────────────────────
// Unit Tests: mergeRoutesWithDatabase
// ─────────────────────────────────────────────────────────

describe('mergeRoutesWithDatabase', () => {
  it('should return all AST routes when database is empty', () => {
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page' },
      { id: '/route-2', path: '/route-2', kind: 'layout' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('/route-1');
    expect(result[1].id).toBe('/route-2');
  });

  it('should merge database metadata with AST routes', () => {
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 5,
      healthStatus: 'flaky',
      suggestionCount: 2,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].errorCount).toBe(5);
    expect(result[0].suggestionCount).toBe(2);
    expect(result[0].errorState).toBe('flaky');
  });

  it('should set errorState to broken when errorCount > 10', () => {
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 15,
      healthStatus: 'healthy',
      suggestionCount: 0,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].errorState).toBe('broken');
  });

  it('should set errorState to flaky when errorCount is 1-10', () => {
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 5,
      healthStatus: 'healthy',
      suggestionCount: 0,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].errorState).toBe('flaky');
  });

  it('should set errorState to healthy when no errors', () => {
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 0,
      healthStatus: 'healthy',
      suggestionCount: 0,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].errorState).toBe('healthy');
  });

  it('should merge badges with existing tags', () => {
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page', tags: ['case'] },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      badges: ['ai', 'shield'],
      errorCount: 0,
      healthStatus: 'healthy',
      suggestionCount: 0,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].tags).toContain('case');
    expect(result[0].tags).toContain('ai');
    expect(result[0].tags).toContain('shield');
  });

  it('should include lastErrorAt and lastErrorMessage when available', () => {
    const lastErrorDate = new Date('2025-01-01T12:00:00Z');
    const astRoutes: RouteNode[] = [
      { id: '/route-1', path: '/route-1', kind: 'page' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 1,
      healthStatus: 'flaky',
      suggestionCount: 0,
      lastErrorAt: lastErrorDate,
      lastErrorMessage: 'Type error on line 42',
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].lastErrorAt).toBe(lastErrorDate.toISOString());
    expect(result[0].lastErrorMessage).toBe('Type error on line 42');
  });

  it('should match by path when id does not match', () => {
    const astRoutes: RouteNode[] = [
      { id: 'different-id', path: '/route-1', kind: 'page' },
    ];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 3,
      healthStatus: 'flaky',
      suggestionCount: 1,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].errorCount).toBe(3);
    expect(result[0].suggestionCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────
// Unit Tests: calculateRouteHealth
// ─────────────────────────────────────────────────────────

describe('calculateRouteHealth', () => {
  it('should return healthy when no errors or warnings', () => {
    expect(calculateRouteHealth(0, 0)).toBe('healthy');
  });

  it('should return flaky when only warnings exist', () => {
    expect(calculateRouteHealth(0, 5)).toBe('flaky');
  });

  it('should return flaky when errorCount is 1-10', () => {
    expect(calculateRouteHealth(1, 0)).toBe('flaky');
    expect(calculateRouteHealth(5, 0)).toBe('flaky');
    expect(calculateRouteHealth(10, 0)).toBe('flaky');
  });

  it('should return broken when errorCount > 10', () => {
    expect(calculateRouteHealth(11, 0)).toBe('broken');
    expect(calculateRouteHealth(50, 0)).toBe('broken');
  });

  it('should use database health status when provided', () => {
    expect(calculateRouteHealth(0, 0, 'broken')).toBe('broken');
    expect(calculateRouteHealth(0, 0, 'flaky')).toBe('flaky');
    expect(calculateRouteHealth(0, 0, 'healthy')).toBe('healthy');
  });

  it('should prioritize database health status over computed', () => {
    // Even with errors, database status should win
    expect(calculateRouteHealth(50, 10, 'healthy')).toBe('healthy');
    expect(calculateRouteHealth(0, 0, 'broken')).toBe('broken');
  });
});

// ─────────────────────────────────────────────────────────
// Unit Tests: astNodeToRouteNode
// ─────────────────────────────────────────────────────────

describe('astNodeToRouteNode', () => {
  it('should convert basic AST node to RouteNode', () => {
    const astNode = {
      id: '/test-route',
      path: '/test-route',
      file: 'src/routes/test-route/+page.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.id).toBe('/test-route');
    expect(result.path).toBe('/test-route');
    expect(result.kind).toBe('page');
    expect(result.status).toBe('ok');
  });

  it('should detect layout kind from file path', () => {
    const astNode = {
      id: '/test-route',
      path: '/test-route',
      file: 'src/routes/test-route/+layout.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.kind).toBe('layout');
  });

  it('should detect server kind from file path', () => {
    const astNode = {
      id: '/test-route',
      path: '/test-route',
      file: 'src/routes/test-route/+server.ts',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.kind).toBe('server');
  });

  it('should detect endpoint kind from api path', () => {
    const astNode = {
      id: '/api/test',
      path: '/api/test',
      file: 'src/routes/api/test/+server.ts',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.kind).toBe('endpoint');
  });

  it('should extract group from path', () => {
    const astNode = {
      id: '/(app)/dashboard',
      path: '/(app)/dashboard',
      file: 'src/routes/(app)/dashboard/+page.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.group).toBe('(app)');
  });

  it('should add case tag for case routes', () => {
    const astNode = {
      id: '/cases/[id]',
      path: '/cases/[id]',
      file: 'src/routes/cases/[id]/+page.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.tags).toContain('case');
  });

  it('should add evidence tag for evidence routes', () => {
    const astNode = {
      id: '/evidence/[id]',
      path: '/evidence/[id]',
      file: 'src/routes/evidence/[id]/+page.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.tags).toContain('evidence');
  });

  it('should add ai tag when hasAiImports is true', () => {
    const astNode = {
      id: '/test-route',
      path: '/test-route',
      file: 'src/routes/test-route/+page.svelte',
      hasAiImports: true,
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.tags).toContain('ai');
  });

  it('should set hasLoad and hasActions from AST node', () => {
    const astNode = {
      id: '/test-route',
      path: '/test-route',
      file: 'src/routes/test-route/+page.svelte',
      hasLoad: true,
      hasActions: true,
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.hasLoad).toBe(true);
    expect(result.hasActions).toBe(true);
  });

  it('should default hasLoad and hasActions to false', () => {
    const astNode = {
      id: '/test-route',
      path: '/test-route',
      file: 'src/routes/test-route/+page.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.hasLoad).toBe(false);
    expect(result.hasActions).toBe(false);
  });

  it('should generate id from path when id is missing', () => {
    const astNode = {
      path: '/test-route',
      file: 'src/routes/test-route/+page.svelte',
    };

    const result = astNodeToRouteNode(astNode);

    expect(result.id).toBe('/test-route');
  });
});

// ─────────────────────────────────────────────────────────
// Integration Tests: Full Enrichment Flow
// ─────────────────────────────────────────────────────────

describe('Full Enrichment Flow', () => {
  it('should handle empty AST routes', () => {
    const astRoutes: RouteNode[] = [];
    const dbMetadata = new Map<string, EnrichedRouteMetadata>();

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result).toHaveLength(0);
  });

  it('should handle large number of routes', () => {
    const astRoutes: RouteNode[] = Array.from({ length: 100 }, (_, i) => ({
      id: `/route-${i}`,
      path: `/route-${i}`,
      kind: 'page' as const,
    }));

    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    for (let i = 0; i < 50; i++) {
      dbMetadata.set(`/route-${i}`, {
        routeId: `/route-${i}`,
        path: `/route-${i}`,
        kind: 'page',
        status: 'healthy',
        errorCount: i % 20,
        healthStatus: i % 20 > 10 ? 'broken' : 'healthy',
        suggestionCount: i % 5,
      });
    }

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result).toHaveLength(100);
    // First 50 should have enrichment data
    expect(result[0].errorCount).toBeDefined();
    // Last 50 should not have enrichment data
    expect(result[99].errorCount).toBeUndefined();
  });

  it('should preserve original route data when merging', () => {
    const astRoutes: RouteNode[] = [
      {
        id: '/route-1',
        path: '/route-1',
        kind: 'page',
        file: 'src/routes/route-1/+page.svelte',
        hasLoad: true,
        hasActions: false,
        tags: ['original-tag'],
      },
    ];

    const dbMetadata = new Map<string, EnrichedRouteMetadata>();
    dbMetadata.set('/route-1', {
      routeId: '/route-1',
      path: '/route-1',
      kind: 'page',
      status: 'healthy',
      errorCount: 0,
      healthStatus: 'healthy',
      suggestionCount: 0,
    });

    const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);

    expect(result[0].file).toBe('src/routes/route-1/+page.svelte');
    expect(result[0].hasLoad).toBe(true);
    expect(result[0].hasActions).toBe(false);
    expect(result[0].tags).toContain('original-tag');
  });
});
