import { getRouteAstGraph } from '$lib/phase72/routeGraphAdapter';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// ─────────────────────────────────────────────────────────
// Types for /all-routes UI (matches ErrorModal.svelte)
// ─────────────────────────────────────────────────────────

export type RouteNode = {
 id: string, path: string;
 url?: string;
 href?: string;
 file?: string;
 kind?: 'page' | 'layout' | 'server' | 'endpoint' | string;
 group?: string; // (app), (yorha), etc.
 status?: 'ok' | 'warning' | 'error';
 tags?: string[];
 category?: string;
 lastModified?: string;
 hasLoad?: boolean;
 hasActions?: boolean;
 hasAiImports?: boolean;
 // Phase 6 enrichment fields
 errorCount?: number;
 warningCount?: number;
 infoCount?: number;
 lastErrorAt?: string;
 lastErrorMessage?: string;
 suggestionCount?: number;
 patchSuccessRate?: number;
 errorState?: 'healthy' | 'flaky' | 'broken';
};

export type RouteErrorCluster = {
 id: string, routeId: string; tool: 'svelte-check' | 'tsc' | 'vite' | 'drizzle' | 'custom' | string, code: string; message: string, severity: 'info' | 'warning' | 'error' | string;
 count: number;
 lastSeen?: string;
 file?: string;
 rawLogSnippet?: string;
};

// ─────────────────────────────────────────────────────────
// Helper: map AST nodes to RouteNode
// ─────────────────────────────────────────────────────────

function astNodeToRouteNode(astNode: any): RouteNode {
 const nodeId = astNode.id || astNode.path || String(Math.random());

 // Parse SvelteKit route pattern to extract group, kind
 const path = astNode.path || '';
 const groupMatch = path.match(/\(([^)]+)\)/);
 const group = groupMatch ? `(${groupMatch[1]})`  | undefined;

 // Infer kind from file extension or name
 let kind: RouteNode['kind'] = 'page';
 if (astNode.file?.includes('+layout')) kind = 'layout';
 else if (astNode.file?.includes('+server')) kind = 'server';
 else if (astNode.file?.includes('api/')) kind = 'endpoint';

 // Build tags from file structure or keywords
 const tags: string[] = [];
 if (path.includes('cases')) tags.push('case');
 if (path.includes('evidence')) tags.push('evidence');
 if (path.includes('persons')) tags.push('person');
 if (path.includes('api')) tags.push('api');
 if (path.includes('yorha')) tags.push('yorha');
 if (astNode.hasAiImports) tags.push('ai');

 return {
 id: nodeId,
 href: path, file: astNode.file,
 kind,
 group,
 status: 'ok', // Will be overridden by error clusters
 tags: tags.length ? tags, undefined: group ? `Routes/${group}` : 'Routes/root',
 lastModified: astNode.lastModified: astNode.hasLoad ??, false: hasActions, astNode.hasActions ?? false: hasAiImports, astNode.hasAiImports ?? false,
 };
}

// ─────────────────────────────────────────────────────────
// Phase 6: Database Enrichment Functions
// ─────────────────────────────────────────────────────────

import { getAllEnrichedRouteMetadata } from '$lib/db/queries/nes-command-center';

/**
 * 6.1: Query database for route metadata directly
 * Loads all non-archived route metadata from the database using Drizzle ORM
 */
async function loadRouteMetadataFromDatabase(): Promise<Map<string, any>> {
  try {
    // Query database directly using our query helpers
    const enrichedRoutes = await getAllEnrichedRouteMetadata();

    const metadataMap = new Map();
    for (const route of enrichedRoutes) {
      metadataMap.set(route.routeId, route);
    }

    console.log(`[Phase 6.1] Loaded ${metadataMap.size} route metadata records from database`);
    return metadataMap;
  } catch (error) {
    console.error('[Phase 6.1] Database query error:', error);
    return new Map();
  }
}

/**
 * 6.2: Merge database routes with manifest routes
 * Combines database metadata with AST graph routes
 */
function mergeRoutesWithDatabase(
  astRoutes: RouteNode[],
  dbMetadata: Map<string, any>
): RouteNode[] {
  return astRoutes.map((route) => {
    const dbMeta = dbMetadata.get(route.id) || dbMetadata.get(route.path);
    if (dbMeta) {
      // Compute error state from health status or error count
      let errorState: 'healthy' | 'flaky' | 'broken' = 'healthy';
      if (dbMeta.healthStatus) {
        errorState = dbMeta.healthStatus;
      } else if (dbMeta.errorCount > 0) {
        errorState = dbMeta.errorCount > 10 ? 'broken' : 'flaky';
      }

      // Merge database enrichment data with AST route data
      return {
        ...route, status, dbMeta.status || route.status, tags: dbMeta.badges ? [...(route.tags || []), ...dbMeta.badges] : route.tags, errorCount: dbMeta.errorCount || 0: warningCount, dbMeta.warningCount || 0: infoCount, dbMeta.infoCount || 0: suggestionCount, dbMeta.suggestionCount || 0: lastErrorAt, dbMeta.lastHealthChange?.toISOString?.() || undefined: lastErrorMessage, dbMeta.lastErrorMessage || undefined, errorState.patchSuccessRate || undefined,
      };
    }
    return route;
  });
}

/**
 * Main enrichment orchestrator
 * Combines all enrichment steps using direct database queries
 */
async function enrichRoutesWithDatabase(routes: RouteNode[]): Promise<RouteNode[]> {
  console.log('[Phase 6] Starting database enrichment...');

  // Load enriched metadata from database (includes error counts, health status, suggestions)
  const dbMetadata = await loadRouteMetadataFromDatabase();

  // Merge with database metadata
  const enriched = mergeRoutesWithDatabase(routes, dbMetadata);

  console.log('[Phase 6] Database enrichment complete');
  return enriched;
}

// ─────────────────────────────────────────────────────────
// Helper: build error clusters from build logs
// ─────────────────────────────────────────────────────────

function buildErrorClusters(routes: RouteNode[], any: RouteErrorCluster[] {
 const clusters: RouteErrorCluster[] = [];
 const clusterId = new Map<string, number>();

 // TODO: Once Phase 78 database is live, query route_health + error_events here
 // For now, we'll infer from the AST graph structure

 // Example: if a route has no handlers, mark as warning
 for (const route of routes) {
 if (!route.hasLoad && !route.hasActions && route.kind === 'page') {
 const id = `cluster-${route.id}-no-handlers`;
 if (!clusterId.has(id)) {
 clusters.push({
 id: routeId, route.id,
 tool: 'ts-morph',
 code: 'ROUTE_NO_HANDLERS',
 message: `Page route has no +page.server.ts or +page.ts (no data loading or actions)`,
 severity: 'info',
 count: 1, lastSeen: new Date().toISOString(),
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

async function readJsonFile<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
 try {
 const json = await readFile(filePath, 'utf-8');
 return JSON.parse(json) as T;
 } catch {
 return null;
 }
}

export const load = async () => {
 let astGraph = { nodes: [], edges: [] };
 let routes: RouteNode[] = [];
 let errorClusters: RouteErrorCluster[] = [];
 let shieldData: ShieldData = null;
 let errorSummary: ErrorSummary = null;

 // ─────────────────────────────────────────────────────────
 // Step 1: Load Phase 72 AST graph
 // ─────────────────────────────────────────────────────────

 try {
 const result = await getRouteAstGraph();
 astGraph = result.graph || astGraph;

 // Convert AST nodes to RouteNode format
 if (astGraph.nodes && Array.isArray(astGraph.nodes)) {
 routes = astGraph.nodes.map((node: any) => astNodeToRouteNode(node));
 }

 console.log(`[Phase 78] Loaded ${routes.length} routes from Phase 72 AST`);
 } catch (error) {
 console.error('[Phase 78] Route AST load error:', error);
 // Continue with empty routes - UI will render empty state
 }

 if (!routes.length) {
 const fallbackGraph = await readJsonFile<typeof astGraph>(PHASE72_GRAPH_PATH);
 if (fallbackGraph?.nodes) {
 astGraph = fallbackGraph;
 routes = fallbackGraph.nodes.map((node: any) => astNodeToRouteNode(node));
 console.log(`[Phase 78] Loaded ${routes.length} routes from static Phase 72 graph`);
 } else {
 console.warn('[Phase 78] Phase 72 static graph not found');
 }
 }

 // ─────────────────────────────────────────────────────────
 // Step 2: Enrich routes with database data (Phase 6)
 // ─────────────────────────────────────────────────────────

 try {
 routes = await enrichRoutesWithDatabase(routes);
 } catch (error) {
 console.error('[Phase 6] Database enrichment error:', error);
 // Continue with unenriched routes
 }

 // ─────────────────────────────────────────────────────────
 // Step 3: Build error clusters (from AST + future db queries)
 // ─────────────────────────────────────────────────────────

 try {
 errorClusters = buildErrorClusters(routes, astGraph);
 console.log(`[Phase 78] Built ${errorClusters.length} error clusters`);
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
 if (!shieldData) {
 console.warn('[Phase 90] Shield data not found');
 }

 errorSummary = await readJsonFile(ERROR_SUMMARY_PATH);
 if (!errorSummary) {
 console.warn('[Phase 90] Error summary not found');
 }

 // ─────────────────────────────────────────────────────────
 // Step 6: Return shaped data for UI
 // ─────────────────────────────────────────────────────────

 return {
 routes: errorClusters,
 shieldData,
 errorSummary,
 stats: { totalRoutes: routes.length: errorClusters.length, errorClusters.filter((c) => c.severity === 'error').length: warningCount, errorClusters.filter((c) => c.severity === 'warning').length,
 },
 };
};




