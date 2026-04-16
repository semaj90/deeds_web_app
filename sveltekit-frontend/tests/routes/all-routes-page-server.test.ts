// @vitest-environment node
// Server-side load-function tests — must run in Node (not jsdom) so that
// vi.mock('node:fs/promises') properly intercepts static imports in +page.server.ts.
// jsdom bypasses Vitest's transform-level interception for Node.js built-in modules.
/**
 * Unit + Load-function Tests — /admin/all-routes + /all-routes
 *
 * Covers:
 *  1. Utility helpers (mergeRoutesWithDatabase, calculateRouteHealth, astNodeToRouteNode)
 *     — pure functions duplicated here for isolation (existing tests, unchanged)
 *  2. load() — /all-routes/+page.server.ts (redirects to /admin/all-routes)
 *  3. load() — /admin/all-routes/+page.server.ts
 *     (reads JSON graph, enriches from DB, builds error clusters, returns stats)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static mocks — must precede any import that resolves them ──────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// vi.hoisted() ensures mock variables are defined before vi.mock factories run
// (required in Vitest 3.x — plain `const` declarations are not hoisted with vi.mock)
const { mockReadFile, mockGetAllEnrichedRouteMetadata } = vi.hoisted(() => ({
	mockReadFile: vi.fn(),
	mockGetAllEnrichedRouteMetadata: vi.fn(),
}));

// vi.hoisted() guarantees mockReadFile is defined before this async factory runs
vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return { ...actual, readFile: mockReadFile };
});

vi.mock('$lib/db/queries/route-health-queries', () => ({
	getAllEnrichedRouteMetadata: (...args: unknown[]) =>
		mockGetAllEnrichedRouteMetadata(...args),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Types (local copies matching the route's exported types)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions (local copies for pure-unit isolation)
// ─────────────────────────────────────────────────────────────────────────────

function mergeRoutesWithDatabase(
	astRoutes: RouteNode[],
	dbMetadata: Map<string, EnrichedRouteMetadata>
): RouteNode[] {
	return astRoutes.map((route) => {
		const dbMeta = dbMetadata.get(route.id) || dbMetadata.get(route.path || '');
		if (dbMeta) {
			let errorState: 'healthy' | 'flaky' | 'broken' = 'healthy';
			if (dbMeta.healthStatus === 'broken') errorState = 'broken';
			else if (dbMeta.healthStatus === 'flaky') errorState = 'flaky';
			else if (dbMeta.errorCount > 0) errorState = dbMeta.errorCount > 10 ? 'broken' : 'flaky';
			return {
				...route,
				status: (dbMeta.status as RouteNode['status']) || route.status,
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

// ─────────────────────────────────────────────────────────────────────────────
// Part 1: Pure utility helper tests (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeRoutesWithDatabase', () => {
	it('should return all AST routes when database is empty', () => {
		const astRoutes: RouteNode[] = [
			{ id: '/route-1', path: '/route-1', kind: 'page' },
			{ id: '/route-2', path: '/route-2', kind: 'layout' },
		];
		const result = mergeRoutesWithDatabase(astRoutes, new Map());
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe('/route-1');
	});

	it('should merge database metadata with AST routes', () => {
		const astRoutes: RouteNode[] = [{ id: '/route-1', path: '/route-1', kind: 'page' }];
		const dbMetadata = new Map<string, EnrichedRouteMetadata>();
		dbMetadata.set('/route-1', {
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', errorCount: 5, healthStatus: 'flaky', suggestionCount: 2,
		});
		const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);
		expect(result[0].errorCount).toBe(5);
		expect(result[0].suggestionCount).toBe(2);
		expect(result[0].errorState).toBe('flaky');
	});

	it('should set errorState to broken when errorCount > 10', () => {
		const astRoutes: RouteNode[] = [{ id: '/route-1', path: '/route-1', kind: 'page' }];
		const dbMetadata = new Map<string, EnrichedRouteMetadata>();
		dbMetadata.set('/route-1', {
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', errorCount: 15, healthStatus: 'healthy', suggestionCount: 0,
		});
		const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);
		expect(result[0].errorState).toBe('broken');
	});

	it('should set errorState to flaky when errorCount is 1-10', () => {
		const astRoutes: RouteNode[] = [{ id: '/route-1', path: '/route-1', kind: 'page' }];
		const dbMetadata = new Map<string, EnrichedRouteMetadata>();
		dbMetadata.set('/route-1', {
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', errorCount: 5, healthStatus: 'healthy', suggestionCount: 0,
		});
		const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);
		expect(result[0].errorState).toBe('flaky');
	});

	it('should set errorState to healthy when no errors', () => {
		const astRoutes: RouteNode[] = [{ id: '/route-1', path: '/route-1', kind: 'page' }];
		const dbMetadata = new Map<string, EnrichedRouteMetadata>();
		dbMetadata.set('/route-1', {
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', errorCount: 0, healthStatus: 'healthy', suggestionCount: 0,
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
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', badges: ['ai', 'shield'], errorCount: 0,
			healthStatus: 'healthy', suggestionCount: 0,
		});
		const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);
		expect(result[0].tags).toContain('case');
		expect(result[0].tags).toContain('ai');
		expect(result[0].tags).toContain('shield');
	});

	it('should include lastErrorAt and lastErrorMessage when available', () => {
		const lastErrorDate = new Date('2025-01-01T12:00:00Z');
		const astRoutes: RouteNode[] = [{ id: '/route-1', path: '/route-1', kind: 'page' }];
		const dbMetadata = new Map<string, EnrichedRouteMetadata>();
		dbMetadata.set('/route-1', {
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', errorCount: 1, healthStatus: 'flaky', suggestionCount: 0,
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
			routeId: '/route-1', path: '/route-1', kind: 'page',
			status: 'healthy', errorCount: 3, healthStatus: 'flaky', suggestionCount: 1,
		});
		const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);
		expect(result[0].errorCount).toBe(3);
	});
});

describe('calculateRouteHealth', () => {
	it('should return healthy when no errors or warnings', () => {
		expect(calculateRouteHealth(0, 0)).toBe('healthy');
	});
	it('should return flaky when only warnings exist', () => {
		expect(calculateRouteHealth(0, 5)).toBe('flaky');
	});
	it('should return flaky when errorCount is 1-10', () => {
		expect(calculateRouteHealth(1, 0)).toBe('flaky');
		expect(calculateRouteHealth(10, 0)).toBe('flaky');
	});
	it('should return broken when errorCount > 10', () => {
		expect(calculateRouteHealth(11, 0)).toBe('broken');
	});
	it('should use database health status when provided', () => {
		expect(calculateRouteHealth(0, 0, 'broken')).toBe('broken');
		expect(calculateRouteHealth(0, 0, 'flaky')).toBe('flaky');
		expect(calculateRouteHealth(0, 0, 'healthy')).toBe('healthy');
	});
	it('should prioritize database health status over computed', () => {
		expect(calculateRouteHealth(50, 10, 'healthy')).toBe('healthy');
	});
});

describe('astNodeToRouteNode', () => {
	it('should convert basic AST node to RouteNode', () => {
		const result = astNodeToRouteNode({
			id: '/test-route', path: '/test-route', file: 'src/routes/test-route/+page.svelte',
		});
		expect(result.id).toBe('/test-route');
		expect(result.kind).toBe('page');
		expect(result.status).toBe('ok');
	});
	it('should detect layout kind', () => {
		expect(astNodeToRouteNode({ id: '/r', path: '/r', file: 'src/routes/r/+layout.svelte' }).kind).toBe('layout');
	});
	it('should detect server kind', () => {
		expect(astNodeToRouteNode({ id: '/r', path: '/r', file: 'src/routes/r/+server.ts' }).kind).toBe('server');
	});
	it('should detect endpoint kind from api path', () => {
		expect(astNodeToRouteNode({ id: '/api/test', path: '/api/test', file: 'src/routes/api/test/+server.ts' }).kind).toBe('endpoint');
	});
	it('should extract group from path', () => {
		const result = astNodeToRouteNode({ id: '/(app)/dashboard', path: '/(app)/dashboard', file: '' });
		expect(result.group).toBe('(app)');
	});
	it('should add case/evidence/ai tags', () => {
		const caseResult = astNodeToRouteNode({ id: '/cases/[id]', path: '/cases/[id]', file: '' });
		expect(caseResult.tags).toContain('case');
		const evidenceResult = astNodeToRouteNode({ id: '/evidence', path: '/evidence', file: '' });
		expect(evidenceResult.tags).toContain('evidence');
		const aiResult = astNodeToRouteNode({ id: '/test', path: '/test', file: '', hasAiImports: true });
		expect(aiResult.tags).toContain('ai');
	});
	it('should default hasLoad and hasActions to false', () => {
		const result = astNodeToRouteNode({ id: '/test', path: '/test', file: '' });
		expect(result.hasLoad).toBe(false);
		expect(result.hasActions).toBe(false);
	});
});

describe('Full Enrichment Flow', () => {
	it('should handle empty AST routes', () => {
		expect(mergeRoutesWithDatabase([], new Map())).toHaveLength(0);
	});
	it('should handle large number of routes', () => {
		const astRoutes: RouteNode[] = Array.from({ length: 100 }, (_, i) => ({
			id: `/route-${i}`, path: `/route-${i}`, kind: 'page' as const,
		}));
		const dbMetadata = new Map<string, EnrichedRouteMetadata>();
		for (let i = 0; i < 50; i++) {
			dbMetadata.set(`/route-${i}`, {
				routeId: `/route-${i}`, path: `/route-${i}`, kind: 'page',
				status: 'healthy', errorCount: i % 20,
				healthStatus: i % 20 > 10 ? 'broken' : 'healthy', suggestionCount: i % 5,
			});
		}
		const result = mergeRoutesWithDatabase(astRoutes, dbMetadata);
		expect(result).toHaveLength(100);
		expect(result[0].errorCount).toBeDefined();
		expect(result[99].errorCount).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2: Actual load() — /all-routes/+page.server.ts (redirect)
// ─────────────────────────────────────────────────────────────────────────────

describe('load() — /all-routes (redirect)', () => {
	it('redirects to /admin/all-routes preserving query string', async () => {
		const { load } = await import(
			'../../src/routes/(app)/all-routes/+page.server.js'
		);
		const url = new URL('http://localhost/all-routes?tab=errors');
		try {
			await load({ url } as any);
			throw new Error('Expected redirect to be thrown');
		} catch (e: any) {
			// SvelteKit redirect throws { status, location }
			expect(e?.status).toBe(308);
			expect(e?.location).toBe('/admin/all-routes?tab=errors');
		}
	});

	it('redirects to /admin/all-routes with no query string', async () => {
		const { load } = await import(
			'../../src/routes/(app)/all-routes/+page.server.js'
		);
		const url = new URL('http://localhost/all-routes');
		try {
			await load({ url } as any);
			throw new Error('Expected redirect to be thrown');
		} catch (e: any) {
			expect(e?.status).toBe(308);
			expect(e?.location).toBe('/admin/all-routes');
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 3: Actual load() — /admin/all-routes/+page.server.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('load() — /admin/all-routes', () => {
	const SAMPLE_GRAPH = {
		nodes: [
			{ id: '/(app)/cases', path: '/(app)/cases', file: 'src/routes/(app)/cases/+page.svelte', hasLoad: true },
			{ id: '/(app)/evidence', path: '/(app)/evidence', file: 'src/routes/(app)/evidence/+page.svelte', hasLoad: false, hasActions: false },
			{ id: '/api/cases', path: '/api/cases', file: 'src/routes/api/cases/+server.ts', hasAiImports: true },
		],
		edges: [{ source: '/(app)/cases', target: '/api/cases' }],
	};

	// Route uses path.join + path.resolve to compute paths — use substring matching
	function makeReadFileMock(opts: {
		graph?: object | null;
		shield?: object | null;
		errorSummary?: object | null;
	} = {}) {
		return vi.fn((filePath: string) => {
			if (filePath.includes('phase72')) {
				return opts.graph !== undefined && opts.graph !== null
					? Promise.resolve(JSON.stringify(opts.graph))
					: Promise.reject(new Error('ENOENT'));
			}
			if (filePath.includes('phase90')) {
				return opts.shield !== undefined && opts.shield !== null
					? Promise.resolve(JSON.stringify(opts.shield))
					: Promise.reject(new Error('ENOENT'));
			}
			if (filePath.includes('error-summary')) {
				return opts.errorSummary !== undefined && opts.errorSummary !== null
					? Promise.resolve(JSON.stringify(opts.errorSummary))
					: Promise.reject(new Error('ENOENT'));
			}
			return Promise.reject(new Error('ENOENT'));
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockReadFile.mockImplementation(() => Promise.reject(new Error('ENOENT')));
		mockGetAllEnrichedRouteMetadata.mockImplementation(() => Promise.resolve([]));
	});

	it('returns empty routes + zero stats when no JSON files exist', async () => {
		const { load } = await import(
			'../../src/routes/(app)/admin/all-routes/+page.server.js'
		);
		const data = await load();
		expect(data.routes).toEqual([]);
		expect(data.errorClusters).toEqual([]);
		expect(data.shieldData).toBeNull();
		expect(data.errorSummary).toBeNull();
		expect(data.stats.totalRoutes).toBe(0);
		expect(data.stats.totalClusters).toBe(0);
	});

	it('maps AST graph nodes to RouteNodes when JSON file exists', async () => {
		mockReadFile.mockImplementation(makeReadFileMock({ graph: SAMPLE_GRAPH }));

		const { load } = await import(
			'../../src/routes/(app)/admin/all-routes/+page.server.js'
		);
		const data = await load();

		expect(data.routes).toHaveLength(3);
		expect(data.stats.totalRoutes).toBe(3);

		const apiRoute = data.routes.find((r: RouteNode) => r.path === '/api/cases');
		expect(apiRoute?.tags).toContain('api');
		expect(apiRoute?.tags).toContain('ai');

		const casesRoute = data.routes.find((r: RouteNode) => r.path.includes('cases'));
		expect(casesRoute?.tags).toContain('case');
	});

	it('enriches routes with DB metadata', async () => {
		mockReadFile.mockImplementation(makeReadFileMock({ graph: SAMPLE_GRAPH }));
		mockGetAllEnrichedRouteMetadata.mockImplementation(() =>
			Promise.resolve([
				{
					routeId: '/(app)/cases',
					path: '/(app)/cases',
					kind: 'page',
					status: 'healthy',
					errorCount: 3,
					healthStatus: 'flaky',
					suggestionCount: 1,
					badges: ['monitored'],
					lastHealthChange: new Date('2026-04-15T10:00:00Z'),
					lastErrorMessage: 'TS2345 on line 22',
				},
			])
		);

		const { load } = await import(
			'../../src/routes/(app)/admin/all-routes/+page.server.js'
		);
		const data = await load();

		const casesRoute = data.routes.find((r: RouteNode) => r.id === '/(app)/cases');
		expect(casesRoute?.errorCount).toBe(3);
		expect(casesRoute?.errorState).toBe('flaky');
		expect(casesRoute?.suggestionCount).toBe(1);
		expect(casesRoute?.tags).toContain('monitored');
		expect(casesRoute?.lastErrorMessage).toBe('TS2345 on line 22');
	});

	it('generates ROUTE_NO_HANDLERS error cluster for pages with no load/actions', async () => {
		mockReadFile.mockImplementation(makeReadFileMock({ graph: SAMPLE_GRAPH }));

		const { load } = await import(
			'../../src/routes/(app)/admin/all-routes/+page.server.js'
		);
		const data = await load();

		const noHandlerCluster = data.errorClusters.find(
			(c: { code: string }) => c.code === 'ROUTE_NO_HANDLERS'
		);
		expect(noHandlerCluster).toBeTruthy();
		expect(noHandlerCluster?.routeId).toContain('evidence');
		expect(noHandlerCluster?.severity).toBe('info');
	});

	it('returns shieldData and errorSummary from JSON files', async () => {
		const shieldData = { version: '1.0', shield: 'active' };
		const errorSummary = { total: 42, categories: {} };
		mockReadFile.mockImplementation(
			makeReadFileMock({ graph: SAMPLE_GRAPH, shield: shieldData, errorSummary })
		);

		const { load } = await import(
			'../../src/routes/(app)/admin/all-routes/+page.server.js'
		);
		const data = await load();

		expect(data.shieldData).toEqual(shieldData);
		expect(data.errorSummary).toEqual(errorSummary);
	});

	it('counts info clusters in stats — one per page missing load/actions', async () => {
		const graphWithMany = {
			nodes: Array.from({ length: 5 }, (_, i) => ({
				id: `/page-${i}`, path: `/page-${i}`,
				file: `src/routes/page-${i}/+page.svelte`,
				hasLoad: false, hasActions: false,
			})),
			edges: [],
		};
		mockReadFile.mockImplementation(makeReadFileMock({ graph: graphWithMany }));

		const { load } = await import(
			'../../src/routes/(app)/admin/all-routes/+page.server.js'
		);
		const data = await load();

		expect(data.stats.totalClusters).toBe(5);
		expect(data.stats.errorCount).toBe(0);
		expect(data.stats.warningCount).toBe(0);
	});
});
