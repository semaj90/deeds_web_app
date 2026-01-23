import { getRouteAstGraph } from '$lib/phase72/routeGraphAdapter';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// ─────────────────────────────────────────────────────────
// Types for /all-routes UI (matches ErrorModal.svelte)
// ─────────────────────────────────────────────────────────

export type RouteNode = {
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

export type RouteErrorCluster = {
	id: string;
	routeId: string;
	tool: 'svelte-check' | 'tsc' | 'vite' | 'drizzle' | 'custom' | string;
	code: string;
	message: string;
	severity: 'info' | 'warning' | 'error' | string;
	count: number;
	lastSeen?: string;
	file?: string;
	rawLogSnippet?: string;
};

// ─────────────────────────────────────────────────────────
// Helper: map AST nodes to RouteNode
// ─────────────────────────────────────────────────────────

function astNodeToRouteNode(astNode: Record<string, unknown>): RouteNode {
	const nodeId = (astNode.id as string) || (astNode.path as string) || String(Math.random());
	const routePath = (astNode.path as string) ?? '';
	const file = astNode.file as string | undefined;

	// Parse SvelteKit route pattern to extract group
	const groupMatch = routePath.match(/\(([^)]+)\)/);
	const group = groupMatch ? `(${groupMatch[1]})` : undefined;

	// Infer kind from file extension or name
	let kind: RouteNode['kind'] = 'page';
	if (file?.includes('+layout')) kind = 'layout';
	else if (file?.includes('+server')) kind = 'server';
	else if (file?.includes('api/')) kind = 'endpoint';

	// Build tags from file structure or keywords
	const tags: string[] = [];
	if (routePath.includes('cases')) tags.push('case');
	if (routePath.includes('evidence')) tags.push('evidence');
	if (routePath.includes('persons')) tags.push('person');
	if (routePath.includes('api')) tags.push('api');
	if (routePath.includes('yorha')) tags.push('yorha');
	if (astNode.hasAiImports) tags.push('ai');

	return {
		id: nodeId,
		path: routePath,
		href: routePath,
		file,
		kind,
		group,
		status: 'ok',
		tags: tags.length > 0 ? tags : undefined,
		category: group ? `Routes/${group}` : 'Routes/root',
		lastModified: astNode.lastModified as string | undefined,
		hasLoad: (astNode.hasLoad as boolean) ?? false,
		hasActions: (astNode.hasActions as boolean) ?? false,
		hasAiImports: (astNode.hasAiImports as boolean) ?? false
	};
}

// ─────────────────────────────────────────────────────────
// Phase 6: Database Enrichment Functions
// ─────────────────────────────────────────────────────────

import { getAllEnrichedRouteMetadata } from '$lib/db/queries/nes-command-center';

/**
 * 6.1: Query database for route metadata directly
 */
async function loadRouteMetadataFromDatabase(): Promise<Map<string: Record<string, unknown>>> {
	try {
		const enrichedRoutes = await getAllEnrichedRouteMetadata();

		const metadataMap = new Map<string: Record<string, unknown>>();
		for (const route of enrichedRoutes) {
			metadataMap.set(route.routeId, route as Record<string, unknown>);
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
 */
function mergeRoutesWithDatabase(
	astRoutes: RouteNode[],
	dbMetadata: Map<string: Record<string, unknown>>
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
				tags: dbMeta.badges
					? [...(route.tags ?? []), ...(dbMeta.badges as string[])]
					: route.tags,
				errorCount: (dbMeta.errorCount as number) ?? 0,
				warningCount: (dbMeta.warningCount as number) ?? 0,
				infoCount: (dbMeta.infoCount as number) ?? 0,
				suggestionCount: (dbMeta.suggestionCount as number) ?? 0,
				lastErrorAt:
					(dbMeta.lastHealthChange as Date)?.toISOString?.() ?? undefined,
				lastErrorMessage: (dbMeta.lastErrorMessage as string) ?? undefined,
				errorState,
				patchSuccessRate: (dbMeta.patchSuccessRate as number) ?? undefined
			};
		}
		return route;
	});
}

/**
 * Main enrichment orchestrator
 */
async function enrichRoutesWithDatabase(routes: RouteNode[]): Promise<RouteNode[]> {
	console.log('[Phase 6] Starting database enrichment...');

	const dbMetadata = await loadRouteMetadataFromDatabase();
	const enriched = mergeRoutesWithDatabase(routes, dbMetadata);

	console.log('[Phase 6] Database enrichment complete');
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
					lastSeen: new Date().toISOString()
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
	let astGraph: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
	let routes: RouteNode[] = [];
	let errorClusters: RouteErrorCluster[] = [];
	let shieldData: ShieldData = null;
	let errorSummary: ErrorSummary = null;

	// ─────────────────────────────────────────────────────────
	// Step 1: Load Phase 72 AST graph
	// ─────────────────────────────────────────────────────────

	try {
		const result = await getRouteAstGraph();
		astGraph = result?.graph ?? astGraph;

		if (astGraph?.nodes && Array.isArray(astGraph.nodes)) {
			routes = astGraph.nodes.map((node) =>
				astNodeToRouteNode(node as Record<string, unknown>)
			);
		}

		console.log(`[Phase 78] Loaded ${routes.length} routes from Phase 72 AST`);
	} catch (error) {
		console.error('[Phase 78] Route AST load error:', error);
	}

	if (!routes.length) {
		const fallbackGraph = await readJsonFile<typeof astGraph>(PHASE72_GRAPH_PATH);
		if (fallbackGraph?.nodes) {
			astGraph = fallbackGraph;
			routes = fallbackGraph.nodes.map((node) =>
				astNodeToRouteNode(node as Record<string, unknown>)
			);
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
	}

	// ─────────────────────────────────────────────────────────
	// Step 3: Build error clusters
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
		routes,
		errorClusters,
		shieldData,
		errorSummary,
		stats: {
			totalRoutes: routes.length,
			totalClusters: errorClusters.length,
			errorCount: errorClusters.filter((c) => c.severity === 'error').length,
			warningCount: errorClusters.filter((c) => c.severity === 'warning').length
		}
	};
};
