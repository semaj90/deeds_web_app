/**
 * Comprehensive Route Metadata Extractor
 * Scans ALL routes (API, pages, archived) for the /all-routes UI
 * Handles: +server.ts, +page.server.ts, +page.svelte, deeds_labs archives
 */

import fs from 'fs';
import path from 'path';

export interface RouteEndpoint {
	path: string;
	type: 'api' | 'page-server' | 'page' | 'archived';
	methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'load' | 'actions')[];
	category: string;
	description: string | null;
	filePath: string;
	hasAuth: boolean;
	responseType: string | null;
	group: string; // (app), (dev), admin, api, etc.
}

export interface RouteCategory {
	name: string;
	count: number;
	endpoints: RouteEndpoint[];
}

export interface RouteStats {
	totalRoutes: number;
	activeRoutes: number;
	archivedRoutes: number;
	apiEndpoints: number;
	pageServers: number;
	pages: number;
	categories: number;
	methodCounts: {
		GET: number;
		POST: number;
		PUT: number;
		DELETE: number;
		PATCH: number;
		load: number;
		actions: number;
	};
	groupCounts: {
		app: number;
		dev: number;
		admin: number;
		api: number;
		other: number;
		archived: number;
	};
	authRequired: number;
	sse: number;
}

const ROUTES_DIR = path.join(process.cwd(), 'src', 'routes');
const DEEDS_LABS_DIR = path.join(process.cwd(), '..', 'deeds_labs');

/**
 * Extract HTTP methods from a +server.ts file
 */
function extractMethods(content: string, fileType: string): ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'load' | 'actions')[] {
	const methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'load' | 'actions')[] = [];

	if (fileType === '+server.ts') {
		if (/export\s+(const|async\s+function)\s+GET/m.test(content)) methods.push('GET');
		if (/export\s+(const|async\s+function)\s+POST/m.test(content)) methods.push('POST');
		if (/export\s+(const|async\s+function)\s+PUT/m.test(content)) methods.push('PUT');
		if (/export\s+(const|async\s+function)\s+DELETE/m.test(content)) methods.push('DELETE');
		if (/export\s+(const|async\s+function)\s+PATCH/m.test(content)) methods.push('PATCH');
	} else if (fileType === '+page.server.ts') {
		if (/export\s+(const|async\s+function)\s+load/m.test(content)) methods.push('load');
		if (/export\s+(const|async\s+function)\s+actions/m.test(content)) methods.push('actions');
	}

	return methods;
}

/**
 * Extract JSDoc description from file
 */
function extractDescription(content: string): string | null {
	const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
	if (jsdocMatch) return jsdocMatch[1].trim();

	// Try single-line comment before export
	const commentMatch = content.match(/\/\/\s*(.+?)\n\s*export\s+(const|async)/);
	if (commentMatch) return commentMatch[1].trim();

	return null;
}

/**
 * Check if endpoint requires authentication
 */
function hasAuthentication(content: string): boolean {
	return content.includes('validateSession') ||
	       content.includes('requireAuth') ||
	       content.includes('event.locals.user');
}

/**
 * Extract response type from code
 */
function extractResponseType(content: string): string | null {
	if (content.includes('return json(')) return 'application/json';
	if (content.includes('new Response') && content.includes('text/event-stream')) return 'text/event-stream';
	if (content.includes('new Response') && content.includes('text/html')) return 'text/html';
	return 'application/json'; // Default assumption
}

/**
 * Categorize endpoint by directory path
 */
function categorizeEndpoint(relativePath: string): string {
	const parts = relativePath.split('/').filter(p => p && !p.startsWith('(') && !p.startsWith('['));
	if (parts.length === 0) return 'Root';

	// Top-level category
	const category = parts[0];

	// Friendly names
	const categoryMap: Record<string, string> = {
		'auth': 'Authentication',
		'cases': 'Case Management',
		'evidence': 'Evidence',
		'chat': 'Chat & AI',
		'ai': 'AI Services',
		'admin': 'Admin',
		'internal': 'Internal',
		'health': 'System Health',
		'analytics': 'Analytics',
		'reports': 'Reports',
		'citations': 'Citations',
		'persons': 'Persons of Interest',
		'rag': 'RAG & Search',
		'embed': 'Embeddings',
		'ollama': 'Ollama',
		'ace': 'ACE Engine',
		'acp': 'ACP Tools',
		'kb': 'Knowledge Base',
		'tags': 'Tags',
		'routes': 'Route Health',
		'cache': 'Cache',
		'mcp': 'MCP',
		'agents': 'Agents',
		'phase72': 'Error Brain',
		'phase82': 'Phase 82',
		'consolidation': 'Consolidation',
		'errors': 'Errors',
		'dashboard': 'Dashboard',
		'indexing': 'Indexing',
		'vision': 'Vision',
		'tools': 'Tools',
		'sse': 'Server-Sent Events',
		'stream': 'Streaming',
		'knowledge': 'Knowledge',
		'summarize': 'Summarization',
		'v1': 'API v1',
		'couchdb-analytics': 'CouchDB Analytics',
		'login': 'Login',
		'webgpu-similarity': 'WebGPU',
		'studio': 'Studio',
		'rag-search': 'RAG Search'
	};

	return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Extract group from path
 */
function extractGroup(relativePath: string): string {
	const groupMatch = relativePath.match(/^\(([^)]+)\)/);
	if (groupMatch) return `(${groupMatch[1]})`;

	if (relativePath.startsWith('api/')) return 'api';
	if (relativePath.startsWith('admin/')) return 'admin';

	return 'other';
}

/**
 * Convert file path to URL path
 */
function filePathToURLPath(relativePath: string, fileType: string): string {
	let urlPath = relativePath
		.replace(/\+server\.ts$/, '')
		.replace(/\+page\.server\.ts$/, '')
		.replace(/\+page\.svelte$/, '')
		.replace(/\/$/, '')
		.replace(/\[([^\]]+)\]/g, ':$1'); // Convert [id] to :id

	// Remove route groups like (app)
	urlPath = urlPath.replace(/\([^)]+\)\//g, '');

	// Add leading slash
	if (!urlPath.startsWith('/')) {
		urlPath = '/' + urlPath;
	}

	// Root route special case
	if (urlPath === '/') {
		return '/';
	}

	return urlPath;
}

/**
 * Recursively scan directory for route files
 */
function scanDirectory(
	dir: string,
	baseDir: string,
	type: 'api' | 'page-server' | 'page' | 'archived',
	results: RouteEndpoint[] = [],
	filePattern: string = '+server.ts'
): RouteEndpoint[] {
	if (!fs.existsSync(dir)) {
		return results;
	}

	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			// Skip node_modules and .git
			if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit') {
				continue;
			}
			// Recurse into subdirectories
			scanDirectory(fullPath, baseDir, type, results, filePattern);
		} else if (entry.name === filePattern) {
			try {
				const content = fs.readFileSync(fullPath, 'utf-8');
				const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/').replace(`/${filePattern}`, '');

				const endpoint: RouteEndpoint = {
					path: filePathToURLPath(relativePath, filePattern),
					type,
					methods: extractMethods(content, filePattern),
					category: categorizeEndpoint(relativePath),
					description: extractDescription(content),
					filePath: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
					hasAuth: hasAuthentication(content),
					responseType: extractResponseType(content),
					group: type === 'archived' ? 'archived' : extractGroup(relativePath)
				};

				results.push(endpoint);
			} catch (err) {
				// Silently skip files that can't be read
			}
		}
	}

	return results;
}

/**
 * Get all route endpoints (active + archived)
 */
export function getAllRouteEndpoints(includeArchived: boolean = false): RouteEndpoint[] {
	try {
		const results: RouteEndpoint[] = [];

		// Scan active routes
		scanDirectory(ROUTES_DIR, ROUTES_DIR, 'api', results, '+server.ts');
		scanDirectory(ROUTES_DIR, ROUTES_DIR, 'page-server', results, '+page.server.ts');

		// Optionally scan archived routes
		if (includeArchived && fs.existsSync(DEEDS_LABS_DIR)) {
			scanDirectory(DEEDS_LABS_DIR, DEEDS_LABS_DIR, 'archived', results, '+server.ts');
		}

		// Sort by path
		results.sort((a, b) => a.path.localeCompare(b.path));

		return results;
	} catch (err) {
		console.error('[Route Scanner] Failed to scan routes:', err);
		return [];
	}
}

/**
 * Get only active API endpoints (for API Explorer)
 */
export function getActiveAPIEndpoints(): RouteEndpoint[] {
	return getAllRouteEndpoints(false).filter(e => e.type === 'api');
}

/**
 * Get only archived endpoints (for deeds_labs panel)
 */
export function getArchivedEndpoints(): RouteEndpoint[] {
	return getAllRouteEndpoints(true).filter(e => e.type === 'archived');
}

/**
 * Group endpoints by category
 */
export function getRoutesByCategory(includeArchived: boolean = false): RouteCategory[] {
	const endpoints = getAllRouteEndpoints(includeArchived);
	const categoryMap = new Map<string, RouteEndpoint[]>();

	for (const endpoint of endpoints) {
		const existing = categoryMap.get(endpoint.category) || [];
		existing.push(endpoint);
		categoryMap.set(endpoint.category, existing);
	}

	const categories: RouteCategory[] = [];
	for (const [name, endpoints] of categoryMap) {
		categories.push({
			name,
			count: endpoints.length,
			endpoints
		});
	}

	// Sort by count (descending)
	categories.sort((a, b) => b.count - a.count);

	return categories;
}

/**
 * Get comprehensive route statistics
 */
export function getRouteStats(): RouteStats {
	const allEndpoints = getAllRouteEndpoints(true);
	const activeEndpoints = allEndpoints.filter(e => e.type !== 'archived');
	const archivedEndpoints = allEndpoints.filter(e => e.type === 'archived');

	return {
		totalRoutes: allEndpoints.length,
		activeRoutes: activeEndpoints.length,
		archivedRoutes: archivedEndpoints.length,
		apiEndpoints: allEndpoints.filter(e => e.type === 'api').length,
		pageServers: allEndpoints.filter(e => e.type === 'page-server').length,
		pages: 0, // Will be calculated from +page.svelte files separately
		categories: getRoutesByCategory(true).length,
		methodCounts: {
			GET: allEndpoints.filter(e => e.methods.includes('GET')).length,
			POST: allEndpoints.filter(e => e.methods.includes('POST')).length,
			PUT: allEndpoints.filter(e => e.methods.includes('PUT')).length,
			DELETE: allEndpoints.filter(e => e.methods.includes('DELETE')).length,
			PATCH: allEndpoints.filter(e => e.methods.includes('PATCH')).length,
			load: allEndpoints.filter(e => e.methods.includes('load')).length,
			actions: allEndpoints.filter(e => e.methods.includes('actions')).length
		},
		groupCounts: {
			app: activeEndpoints.filter(e => e.group === '(app)').length,
			dev: activeEndpoints.filter(e => e.group === '(dev)').length,
			admin: activeEndpoints.filter(e => e.group === 'admin' || e.group === '(app)' && e.path.includes('/admin')).length,
			api: activeEndpoints.filter(e => e.group === 'api').length,
			other: activeEndpoints.filter(e => e.group === 'other').length,
			archived: archivedEndpoints.length
		},
		authRequired: allEndpoints.filter(e => e.hasAuth).length,
		sse: allEndpoints.filter(e => e.responseType === 'text/event-stream').length
	};
}
