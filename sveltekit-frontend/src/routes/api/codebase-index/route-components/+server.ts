/**
 * Route→Component Resolver API
 *
 * GET /api/codebase-index/route-components?route=/cases/[id]
 *
 * Resolves the full component tree for a SvelteKit route:
 *   - Page + page server/load files
 *   - Layout chain (all ancestor layouts)
 *   - Imported Svelte components (from <Component> tags and import statements)
 *   - Stores (.svelte.ts files)
 *   - API endpoints referenced in fetch() calls
 *
 * Uses file system traversal + regex-based import/component extraction.
 * Cached in Redis for 15 minutes.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve, relative, dirname, basename } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { setCache, cognitiveCache } from '$lib/server/cache.js';
import { z } from 'zod';

const routeComponentsSchema = z.object({
	route: z.string().min(1, 'route query parameter is required').max(200),
});

const SRC_ROOT = resolve(process.cwd(), 'src');
const ROUTES_ROOT = resolve(SRC_ROOT, 'routes');
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_DEPTH = 2;
const MAX_COMPONENTS = 50;

interface RouteComponentsResult {
	route: string;
	files: {
		page: string[];
		pageServer: string[];
		pageLoad: string[];
		layouts: string[];
		layoutServers: string[];
		components: string[];
		stores: string[];
		apiEndpoints: string[];
	};
	totalFiles: number;
	timing: { totalMs: number };
}

/** Map a route path to its filesystem directory, searching through route groups */
function resolveRouteDir(routePath: string): string | null {
	// Direct match: /admin/error-brain → routes/admin/error-brain or routes/(app)/admin/error-brain
	const segments = routePath.replace(/^\//, '').split('/');

	// Try direct path first
	const direct = resolve(ROUTES_ROOT, ...segments);
	if (existsSync(direct)) return direct;

	// Try with (app) group
	const withApp = resolve(ROUTES_ROOT, '(app)', ...segments);
	if (existsSync(withApp)) return withApp;

	// Try other route groups
	try {
		const topEntries = readdirSync(ROUTES_ROOT);
		for (const entry of topEntries) {
			if (entry.startsWith('(') && entry.endsWith(')')) {
				const grouped = resolve(ROUTES_ROOT, entry, ...segments);
				if (existsSync(grouped)) return grouped;
			}
		}
	} catch { /* ignore */ }

	return null;
}

/** Find all layout files in the chain from a route directory up to the routes root */
function findLayoutChain(routeDir: string): { layouts: string[]; layoutServers: string[] } {
	const layouts: string[] = [];
	const layoutServers: string[] = [];
	let dir = routeDir;

	while (dir.startsWith(ROUTES_ROOT)) {
		for (const name of ['+layout.svelte']) {
			const full = resolve(dir, name);
			if (existsSync(full)) layouts.push(relPath(full));
		}
		for (const name of ['+layout.server.ts', '+layout.ts']) {
			const full = resolve(dir, name);
			if (existsSync(full)) layoutServers.push(relPath(full));
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return { layouts, layoutServers };
}

/** Extract import paths from a file */
function extractImports(content: string): string[] {
	const imports: string[] = [];
	// Static imports: import X from 'path' / import { X } from 'path'
	const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g;
	let match;
	while ((match = importRegex.exec(content)) !== null) {
		imports.push(match[1]);
	}
	// Dynamic imports: await import('path')
	const dynamicRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
	while ((match = dynamicRegex.exec(content)) !== null) {
		imports.push(match[1]);
	}
	return imports;
}

/** Extract Svelte component names from a .svelte file template */
function extractSvelteComponents(content: string): string[] {
	const components = new Set<string>();
	// <ComponentName ... > (PascalCase tags are components)
	const tagRegex = /<([A-Z][A-Za-z0-9]+)[\s/>]/g;
	let match;
	while ((match = tagRegex.exec(content)) !== null) {
		components.add(match[1]);
	}
	// {@render snippetName()} — less common, but track
	const renderRegex = /\{@render\s+(\w+)/g;
	while ((match = renderRegex.exec(content)) !== null) {
		components.add(match[1]);
	}
	return Array.from(components);
}

/** Extract API endpoint paths from fetch() calls */
function extractApiEndpoints(content: string): string[] {
	const endpoints = new Set<string>();
	// fetch('/api/...') or fetch(`/api/...`)
	const fetchRegex = /fetch\(\s*[`'"](\/?api\/[^`'")\s]+)/g;
	let match;
	while ((match = fetchRegex.exec(content)) !== null) {
		let ep = match[1];
		if (!ep.startsWith('/')) ep = '/' + ep;
		endpoints.add(ep);
	}
	return Array.from(endpoints);
}

/** Resolve a $lib/ import to a relative path */
function resolveLibImport(importPath: string): string | null {
	if (importPath.startsWith('$lib/')) {
		const libPath = importPath.slice(5).replace(/\.js$/, '');
		// Try multiple extensions
		for (const ext of ['.svelte', '.svelte.ts', '.ts', '/index.ts', '/index.svelte']) {
			const full = resolve(SRC_ROOT, 'lib', libPath + ext);
			if (existsSync(full)) return relPath(full);
		}
		// Try without extension (directory with index)
		const dirPath = resolve(SRC_ROOT, 'lib', libPath);
		if (existsSync(dirPath)) {
			for (const idx of ['index.ts', 'index.svelte']) {
				const full = resolve(dirPath, idx);
				if (existsSync(full)) return relPath(full);
			}
		}
	}
	return null;
}

function relPath(absPath: string): string {
	return relative(resolve(process.cwd()), absPath).replace(/\\/g, '/');
}

/** Recursively resolve component imports from a file */
function resolveComponentTree(
	filePath: string,
	depth: number,
	visited: Set<string>,
	result: { components: Set<string>; stores: Set<string>; apiEndpoints: Set<string> },
): void {
	if (depth > MAX_DEPTH || visited.has(filePath) || result.components.size >= MAX_COMPONENTS) return;
	visited.add(filePath);

	const absPath = resolve(process.cwd(), filePath);
	let content: string;
	try {
		content = readFileSync(absPath, 'utf-8');
	} catch {
		return;
	}

	// Extract imports
	const imports = extractImports(content);
	for (const imp of imports) {
		const resolved = resolveLibImport(imp);
		if (!resolved) continue;

		if (resolved.endsWith('.svelte')) {
			result.components.add(resolved);
			resolveComponentTree(resolved, depth + 1, visited, result);
		} else if (resolved.endsWith('.svelte.ts')) {
			result.stores.add(resolved);
		}
	}

	// Extract Svelte component tags (for .svelte files)
	if (filePath.endsWith('.svelte')) {
		const componentNames = extractSvelteComponents(content);
		// Try to match component names to imports
		for (const name of componentNames) {
			// Check if there's a matching import
			for (const imp of imports) {
				if (imp.includes(name) || imp.endsWith('/' + name + '.svelte') || imp.endsWith('/' + name)) {
					const resolved = resolveLibImport(imp);
					if (resolved) {
						result.components.add(resolved);
						resolveComponentTree(resolved, depth + 1, visited, result);
					}
				}
			}
		}
	}

	// Extract API endpoints
	const endpoints = extractApiEndpoints(content);
	for (const ep of endpoints) {
		result.apiEndpoints.add(ep);
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = routeComponentsSchema.safeParse({
		route: url.searchParams.get('route'),
	});

	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid params' }, { status: 400 });
	}

	const { route } = parsed.data;
	const startMs = Date.now();

	// Check cache
	const cacheKey = `ast:route-components:${createHash('sha256').update(route).digest('hex').slice(0, 16)}`;
	const cached = await cognitiveCache.getJsonbDocument<RouteComponentsResult>(cacheKey);
	if (cached) {
		return json({ ...cached, cached: true });
	}

	// Resolve route directory
	const routeDir = resolveRouteDir(route);
	if (!routeDir) {
		return json({ error: `Route directory not found for: ${route}` }, { status: 404 });
	}

	const page: string[] = [];
	const pageServer: string[] = [];
	const pageLoad: string[] = [];

	// Find page files
	for (const name of ['+page.svelte']) {
		const full = resolve(routeDir, name);
		if (existsSync(full)) page.push(relPath(full));
	}
	for (const name of ['+page.server.ts']) {
		const full = resolve(routeDir, name);
		if (existsSync(full)) pageServer.push(relPath(full));
	}
	for (const name of ['+page.ts']) {
		const full = resolve(routeDir, name);
		if (existsSync(full)) pageLoad.push(relPath(full));
	}

	// Find layout chain
	const { layouts, layoutServers } = findLayoutChain(routeDir);

	// Resolve component tree from page + layouts
	const collector = {
		components: new Set<string>(),
		stores: new Set<string>(),
		apiEndpoints: new Set<string>(),
	};
	const visited = new Set<string>();

	for (const f of [...page, ...layouts]) {
		resolveComponentTree(f, 0, visited, collector);
	}
	for (const f of [...pageServer, ...pageLoad, ...layoutServers]) {
		// Extract API endpoints from server files too
		const absPath = resolve(process.cwd(), f);
		try {
			const content = readFileSync(absPath, 'utf-8');
			for (const ep of extractApiEndpoints(content)) {
				collector.apiEndpoints.add(ep);
			}
		} catch { /* skip */ }
	}

	const result: RouteComponentsResult = {
		route,
		files: {
			page,
			pageServer,
			pageLoad,
			layouts,
			layoutServers,
			components: Array.from(collector.components).sort(),
			stores: Array.from(collector.stores).sort(),
			apiEndpoints: Array.from(collector.apiEndpoints).sort(),
		},
		totalFiles:
			page.length +
			pageServer.length +
			pageLoad.length +
			layouts.length +
			layoutServers.length +
			collector.components.size +
			collector.stores.size,
		timing: { totalMs: Date.now() - startMs },
	};

	// Cache result
	await setCache(cacheKey, result, CACHE_TTL_MS);

	return json(result);
};
