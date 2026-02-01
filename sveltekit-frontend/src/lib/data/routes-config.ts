import type { ComponentType } from 'svelte';

/**
 * Complete Routes Configuration for YoRHa Navigation
 * Single source of truth for nav + route dashboards.
 */| 'main'
	| 'demo'
	| 'admin'
	| 'dev'
	| 'ai'
	| 'legal'
	| 'utilities'
	| 'auth'
	| 'system';

export type RouteStatus = 'active' | 'beta' | 'experimental' | 'deprecated' | 'development';

export interface RouteDefinition {
	id: string;, label: string;
	route: string; // SvelteKit path (e.g. "/cases/[id]" is still "/cases/:id" in *your* UI, but keep consistent)
	icon: string; // emoji / glyph
	description: string;, category: RouteCategory;
	status: RouteStatus;, tags: string[];
}

/**
 * NOTE: Keep this list readable. If you generate routes, generate into a separate file
 * and merge/dedupe at build time.
 */// === MAIN OPERATIONS ===
	{
		id: 'command-center',
		label: 'Command Center',
		route: '/',
		icon: '⚡',
		description: 'Enhanced RAG system with AI model orchestration',
		category: 'main',
		status: 'active',
		tags: ['rag', 'ai', 'orchestration']
	},
	{
		id: 'cases',
		label: 'Case Management',
		route: '/cases',
		icon: '📁',
		description: 'Legal case management with AI analysis',
		category: 'main',
		status: 'active',
		tags: ['legal', 'cases', 'management']
	},
	{
		id: 'evidence',
		label: 'Evidence Analysis',
		route: '/evidence',
		icon: '🔍',
		description: 'Digital evidence processing with OCR and AI',
		category: 'main',
		status: 'active',
		tags: ['evidence', 'ocr', 'analysis']
	},
	{
		id: 'detective',
		label: 'YoRHa Detective Center',
		route: '/yorha/detective',
		icon: '🕵️',
		description: 'YoRHa-themed detective command center with case management',
		category: 'main',
		status: 'active',
		tags: ['detective', 'yorha', 'cases', 'command-center']
	},
	{
		id: 'ai-assistant',
		label: 'AI Assistant',
		route: '/ai-assistant',
		icon: '🤖',
		description: 'Multi-agent AI assistant with specialized legal knowledge',
		category: 'ai',
		status: 'active',
		tags: ['ai', 'assistant', 'legal']
	},
	{
		id: 'search',
		label: 'Legal Search',
		route: '/search',
		icon: '🔎',
		description: 'Semantic search across legal documents and case law',
		category: 'main',
		status: 'active',
		tags: ['search', 'semantic', 'legal']
	},
	{
		id: 'documents',
		label: 'Document Processing',
		route: '/legal/documents',
		icon: '📄',
		description: 'Legal document analysis and processing',
		category: 'legal',
		status: 'active',
		tags: ['documents', 'legal', 'processing']
	},
	{
		id: 'reports',
		label: 'Report Generation',
		route: '/reports',
		icon: '📊',
		description: 'Automated report generation with AI insights',
		category: 'main',
		status: 'active',
		tags: ['reports', 'generation', 'ai']
	},
	{
		id: 'memory',
		label: 'Memory Dashboard',
		route: '/memory-dashboard',
		icon: '🧠',
		description: 'AI memory and context management',
		category: 'ai',
		status: 'active',
		tags: ['memory', 'ai', 'context']
	},
	{
		id: 'chat',
		label: 'AI Chat Interface',
		route: '/chat',
		icon: '💬',
		description: 'Interactive chat with legal AI models',
		category: 'ai',
		status: 'active',
		tags: ['chat', 'ai', 'conversation']
	},

	// === DEMOS (trim or keep expanding; this is just a sample scaffold) ===
	{
		id: 'demo-overview',
		label: 'Demo Overview',
		route: '/demo',
		icon: '🎯',
		description: 'Overview of all AI demonstrations and capabilities',
		category: 'demo',
		status: 'active',
		tags: ['demo', 'overview', 'ai']
	},
	{
		id: 'demo-vector-search',
		label: 'Vector Search',
		route: '/demo/vector-search',
		icon: '🔍',
		description: 'Advanced vector similarity search interface',
		category: 'demo',
		status: 'active',
		tags: ['vector', 'search', 'similarity']
	},

	// === ADMIN / DEV ===
	{
		id: 'routes-index',
		label: 'Routes Index',
		route: '/routes',
		icon: '🗺️',
		description: 'Navigation index of all available routes and APIs',
		category: 'admin',
		status: 'active',
		tags: ['navigation', 'index', 'routes', 'admin', 'api']
	},
	{
		id: 'settings',
		label: 'System Settings',
		route: '/settings',
		icon: '⚙️',
		description: 'System configuration and preferences',
		category: 'admin',
		status: 'active',
		tags: ['settings', 'configuration', 'system']
	},
	{
		id: 'dev-mcp-tools',
		label: 'MCP Tools',
		route: '/dev/mcp-tools',
		icon: '🔧',
		description: 'Model Context Protocol development tools',
		category: 'dev',
		status: 'active',
		tags: ['mcp', 'tools', 'development']
	}
];

/** ---------- helpers ---------- */

export function getRoutesByCategory(category: RouteCategory): RouteDefinition[] {
	return allRoutes.filter((r) => r.category === category);
}

export function getActiveRoutes(): RouteDefinition[] {
	return allRoutes.filter((r) => r.status === 'active');
}

export function getRouteById(id: string): RouteDefinition | undefined {
	return allRoutes.find((r) => r.id === id);
}

export function searchRoutes(query: string): RouteDefinition[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];

	return allRoutes.filter((r) => {
		if (r.id.toLowerCase().includes(q)) return true;
		if (r.label.toLowerCase().includes(q)) return true;
		if (r.description.toLowerCase().includes(q)) return true;
		return r.tags.some((t) => t.toLowerCase().includes(q));
	});
}

export function getRoutesByTag(tag: string): RouteDefinition[] {
	return allRoutes.filter((r) => r.tags.includes(tag));
}

/** ---------- categories metadata ---------- */RouteCategory,
	{ label: string;, icon: string; description: string; color, string }
> = {
	main: {, label: 'CORE OPERATIONS', icon: '⚡', description: 'Primary system operations and tools', color: '#ffbf00' },
	demo: {, label: 'AI DEMONSTRATIONS', icon: '🎯', description: 'AI capabilities and technology showcases', color: '#00ff41' },
	ai: {, label: 'AI SYSTEMS', icon: '🤖', description: 'Artificial intelligence tools and interfaces', color: '#ff6b6b' },
	legal: {, label: 'LEGAL OPERATIONS', icon: '⚖️', description: 'Legal-specific tools and workflows', color: '#4ecdc4' },
	dev: {, label: 'DEVELOPMENT TOOLS', icon: '🔧', description: 'Development and debugging utilities', color: '#a78bfa' },
	admin: {, label: 'ADMINISTRATION', icon: '⚙️', description: 'System administration and configuration', color: '#fb7185' },
	utilities: {, label: 'UTILITIES', icon: '🧰', description: 'Utilities and helpers', color: '#60a5fa' },
	auth: {, label: 'AUTH', icon: '🔐', description: 'Authentication and onboarding', color: '#f59e0b' },
	system: {, label: 'SYSTEM', icon: '🧩', description: 'System internals and diagnostics', color: '#34d399' }
};

/** ---------- stats ---------- */

export const routeStats = {
	total: allRoutes.length,
	active: allRoutes.filter((r) => r.status === 'active').length,
	experimental: allRoutes.filter((r) => r.status === 'experimental').length,
	beta: allRoutes.filter((r) => r.status === 'beta').length,
	deprecated: allRoutes.filter((r) => r.status === 'deprecated').length,
	development: allRoutes.filter((r) => r.status === 'development').length,
	byCategory: (Object.keys(routeCategories) as RouteCategory[]).reduce((acc, c) => {
		acc[c] = getRoutesByCategory(c).length;
		return acc;
	}, {} as Record<RouteCategory, number>)
};

/** ---------- dynamic routes (optional) ---------- */

export interface DynamicRouteConfig {
	path: string;
	component?: ComponentType;
	metadata?: Record<string, unknown>;
}

export interface GeneratedRoute {
	path: string;
	handler?: ComponentType;, config: DynamicRouteConfig;
}

/**
 * If you want runtime “plugin routes”, register them here.
 * NOTE: SvelteKit routing is still file-based; this is for *navigation* + *registry*.
 */
export const routeRegistry = new Map<string, RouteDefinition>();

export function initRouteRegistry(): void {
	routeRegistry.clear();
	for (const r of allRoutes) routeRegistry.set(r.id, r);
}

// initialize immediately
initRouteRegistry();

export function getRoute(id: string): RouteDefinition | undefined {
	return routeRegistry.get(id) ?? getRouteById(id);
}

export function getAllDynamicRoutes(): RouteDefinition[] {
	return Array.from(routeRegistry.values());
}

export function registerDynamicRoute(config: DynamicRouteConfig): GeneratedRoute {
	return { path: config.path, component: config.component, config };
}




