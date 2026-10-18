import { readFile } from 'node:fs/promises';
import path from 'node:path';

// ─────────────────────────────────────────────────────────
// Types for /all-routes UI (matches ErrorModal.svelte)
// ─────────────────────────────────────────────────────────

import {
  astNodeToRouteNode,
  resolveRouteFields,
  type ResolvedRouteFields,
  type RouteErrorCluster,
  type RouteNode,
} from './route-lineage.js';

export type { ResolvedRouteFields, RouteErrorCluster, RouteNode };
export const _resolveRouteFields = resolveRouteFields;
export const _astNodeToRouteNode = astNodeToRouteNode;


// ─────────────────────────────────────────────────────────
// Phase 6: Database Enrichment Functions
// ─────────────────────────────────────────────────────────

/**
 * 6.1: Query database for route metadata directly
 * Uses dynamic import to avoid Rollup chunk naming collision between
 * schema/nes-command-center.ts and queries/nes-command-center.ts
 */
async function loadRouteMetadataFromDatabase(): Promise<Map<string, Record<string, unknown>>> {
  try {
    const { getAllEnrichedRouteMetadata } = await import('$lib/db/queries/route-health-queries');
    const enrichedRoutes = await getAllEnrichedRouteMetadata();

    const metadataMap = new Map<string, Record<string, unknown>>();
    for (const route of enrichedRoutes) {
      metadataMap.set(route.routeId, route as Record<string, unknown>);
    }

    return metadataMap;
  } catch (error) {
    console.error('[Phase 6.1] Database query error:', error);
    return new Map();
  }
}

/**
 * 6.2: Merge database routes with manifest routes
 */
function mergeRoutesWithDatabase(
  astRoutes: RouteNode[],
  dbMetadata: Map<string, Record<string, unknown>>
): RouteNode[] {
  return astRoutes.map((route) => {
    const dbMeta = dbMetadata.get(route.id) || dbMetadata.get(route.path);
    if (dbMeta) {
      // Compute error state from health status or error count
      let errorState: 'healthy' | 'flaky' | 'broken' = 'healthy';
      if (dbMeta.healthStatus) {
        errorState = dbMeta.healthStatus as 'healthy' | 'flaky' | 'broken';
      } else if ((dbMeta.errorCount as number) > 0) {
        errorState = (dbMeta.errorCount as number) > 10 ? 'broken' : 'flaky';
      }

      // Merge database enrichment data with AST route data
      return {
        ...route,
        status: (dbMeta.status as RouteNode['status']) || route.status,
        tags: dbMeta.badges ? [...(route.tags ?? []), ...(dbMeta.badges as string[])] : route.tags,
        errorCount: (dbMeta.errorCount as number) ?? 0,
        warningCount: (dbMeta.warningCount as number) ?? 0,
        infoCount: (dbMeta.infoCount as number) ?? 0,
        suggestionCount: (dbMeta.suggestionCount as number) ?? 0,
        lastErrorAt: (dbMeta.lastHealthChange as Date)?.toISOString?.() ?? undefined,
        lastErrorMessage: (dbMeta.lastErrorMessage as string) ?? undefined,
        errorState,
        patchSuccessRate: (dbMeta.patchSuccessRate as number) ?? undefined,
      };
    }
    return route;
  });
}

/**
 * Main enrichment orchestrator
 */
async function enrichRoutesWithDatabase(routes: RouteNode[]): Promise<RouteNode[]> {
  const dbMetadata = await loadRouteMetadataFromDatabase();
  const enriched = mergeRoutesWithDatabase(routes, dbMetadata);
  return enriched;
}

// ─────────────────────────────────────────────────────────
// Helper: build error clusters from build logs
// ─────────────────────────────────────────────────────────

function buildErrorClusters(routes: RouteNode[], _astGraph: unknown): RouteErrorCluster[] {
  const clusters: RouteErrorCluster[] = [];
  const clusterId = new Map<string, number>();

  for (const route of routes) {
    if (!route?.hasLoad && !route?.hasActions && route.kind === 'page') {
      const id = `cluster-${route.id}-no-handlers`;
      if (!clusterId.has(id)) {
        clusters.push({
          id,
          routeId: route.id,
          tool: 'ts-morph',
          code: 'ROUTE_NO_HANDLERS',
          message: `Page route has no +page.server.ts or +page.ts (no data loading or actions)`,
          severity: 'info',
          count: 1,
          lastSeen: new Date().toISOString(),
        });
        clusterId.set(id, clusters.length - 1);
      }
    }
  }

  return clusters;
}

type ShieldData = Record<string, unknown> | null;
type ErrorSummary = Record<string, unknown> | null;

const STATIC_DIR = path.resolve('static');
const PHASE72_GRAPH_PATH = path.join(STATIC_DIR, 'phase72', 'route-ast-graph.json');
const PHASE90_SHIELD_PATH = path.join(STATIC_DIR, 'phase90', 'state-machine-shield.json');
const ERROR_SUMMARY_PATH = path.join(STATIC_DIR, 'errors', 'error-summary.json');
const SSR_VALKEY_KEY = 'bitfrost:all-routes:ssr:v1';
const SSR_VALKEY_TTL_SECONDS = 300;

let ssrMemoryCache: { ts: number; payload: Record<string, unknown> } | null = null;

async function readJsonFile<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
  try {
    const json = await readFile(filePath, 'utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export const load = async () => {
  // 0. Check L0 memory cache (60s) and L1 Redis/Valkey cache (300s) for fast SSR hydration
  if (ssrMemoryCache && Date.now() - ssrMemoryCache.ts < 60_000) {
    return {
      ...ssrMemoryCache.payload,
      ssrCacheSource: 'memory-l0',
    };
  }

  try {
    const [{ getRedis }, { fastJsonParse }] = await Promise.all([
      import('$lib/server/redis.js'),
      import('$lib/server/gpu/simdjson-bridge.js'),
    ]);
    const redis = getRedis();
    const cachedRaw = await Promise.race([
      redis.get(SSR_VALKEY_KEY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
    ]);
    if (cachedRaw) {
      const parsed = fastJsonParse<Record<string, unknown>>(cachedRaw);
      ssrMemoryCache = { ts: Date.now(), payload: parsed };
      return {
        ...parsed,
        ssrCacheSource: 'valkey-l1',
      };
    }
  } catch {
    // Non-fatal: fall through to disk + DB assembly
  }

  let astGraph: {
    nodes: unknown[];
    edges: unknown[];
  } = { nodes: [], edges: [] };
  let routes: RouteNode[] = [];
  let errorClusters: RouteErrorCluster[] = [];
  let shieldData: ShieldData = null;
  let errorSummary: ErrorSummary = null;

  // ─────────────────────────────────────────────────────────
  // Step 1: Load Phase 72 AST graph
  // ─────────────────────────────────────────────────────────

  const phase72Graph = await readJsonFile<typeof astGraph>(PHASE72_GRAPH_PATH);
  if (phase72Graph?.nodes) {
    astGraph = phase72Graph;
    routes = phase72Graph.nodes
      .map((node) => astNodeToRouteNode(node as Record<string, unknown>))
      .filter((r): r is RouteNode => r !== null);
  }

  // Note: Live filesystem routes from getAllRouteEndpoints ($lib/server/api-metadata-extractor.js)
  // are loaded asynchronously via /api/routes/metadata in +page.svelte onMount() (L2 IndexedDB <-> L1 Valkey).

  // ─────────────────────────────────────────────────────────
  // Step 2: Enrich routes with database data (Phase 6)
  // ─────────────────────────────────────────────────────────

  try {
    routes = await Promise.race([
      enrichRoutesWithDatabase(routes),
      new Promise<RouteNode[]>((resolve) => setTimeout(() => resolve(routes), 400)),
    ]);
  } catch (error) {
    console.error('[Phase 6] Database enrichment error:', error);
  }

  // ─────────────────────────────────────────────────────────
  // Step 3: Build error clusters
  // ─────────────────────────────────────────────────────────

  try {
    errorClusters = buildErrorClusters(routes, astGraph);
  } catch (error) {
    console.error('[Phase 78] Error cluster build error:', error);
  }

  // ─────────────────────────────────────────────────────────
  // Step 4: Update route status based on error clusters
  // ─────────────────────────────────────────────────────────

  const clustersByRouteId = new Map<string, RouteErrorCluster[]>();
  for (const cluster of errorClusters) {
    if (!clustersByRouteId.has(cluster.routeId)) {
      clustersByRouteId.set(cluster.routeId, []);
    }
    clustersByRouteId.get(cluster.routeId)!.push(cluster);
  }

  for (const route of routes) {
    const clusters = clustersByRouteId.get(route.id) ?? [];
    if (clusters.some((c) => c.severity === 'error')) {
      route.status = 'error';
    } else if (clusters.some((c) => c.severity === 'warning')) {
      route.status = 'warning';
    }
  }

  // ─────────────────────────────────────────────────────────
  // Step 5: Load shield + error summary data
  // ─────────────────────────────────────────────────────────

  shieldData = await readJsonFile(PHASE90_SHIELD_PATH);
  errorSummary = await readJsonFile(ERROR_SUMMARY_PATH);

  // ─────────────────────────────────────────────────────────
  // Step 6: Cache in L0/L1 Valkey and return shaped data for SSR
  // ─────────────────────────────────────────────────────────

  const payload = {
    routes,
    errorClusters,
    shieldData,
    errorSummary,
    stats: {
      totalRoutes: routes.length,
      totalClusters: errorClusters.length,
      errorCount: errorClusters.filter((c) => c.severity === 'error').length,
      warningCount: errorClusters.filter((c) => c.severity === 'warning').length,
    },
  };

  ssrMemoryCache = { ts: Date.now(), payload };

  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    await Promise.race([
      redis.set(SSR_VALKEY_KEY, JSON.stringify(payload), 'EX', SSR_VALKEY_TTL_SECONDS),
      new Promise((resolve) => setTimeout(resolve, 200)),
    ]);
  } catch {
    // Non-fatal
  }

  return {
    ...payload,
    ssrCacheSource: 'computed',
  };
};
