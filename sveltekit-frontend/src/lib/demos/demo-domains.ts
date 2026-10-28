/**
 * Demo index organisation by the Parent Atlas domain taxonomy.
 *
 * The 13 top-level groups are a snapshot of `atlas_domain_ontology` (taxonomy_level 0) and the root rows of
 * `domain_taxonomy_v1`, read 2026-10-28. The slug-to-domain table below is an explicit, reviewable
 * classification (a proposal, `canonicalAuthority: false`): it is not inferred at runtime and never
 * guesses, so a demo that is missing from it is reported as `unclassified`.
 */

export const DEMO_DOMAINS = {
	api: 'API Design & Integration',
	auth: 'Authentication & Authorization',
	cache: 'Caching',
	compiler: 'Compiler & Language Tooling',
	database: 'Database & Persistence',
	devops: 'DevOps & Infrastructure',
	'error-handling': 'Error Handling & Recovery',
	frontend: 'Frontend & UI',
	gpu: 'GPU & CUDA Acceleration',
	graph: 'Graph & Topology',
	'machine-learning': 'Machine Learning',
	retrieval: 'Information Retrieval',
	test: 'Testing',
} as const;

export type DemoDomainId = keyof typeof DEMO_DOMAINS;
export type DemoDomain = DemoDomainId | 'unclassified';

const GROUPS: Record<DemoDomainId, readonly string[]> = {
	api: [],
	auth: [],
	cache: ['cache', 'gpu-cache'],
	compiler: [],
	database: [],
	devops: ['phantom-code-lab', '/admin/observability', '/admin/dev-tools'],
	'error-handling': ['agentic-errors', 'agentic-errors/analysis', 'agentic-errors/fastmcp', 'agentic-errors/rag-kag'],
	frontend: [
		'bits-ui', 'bento-dashboard', 'icons', 'spotlight', 'keyboard-shortcuts', 'smart-positioning', 'yorha-icons',
		'svelte5-components', 'page-layouts', 'unified-dashboard', 'stats-panel', 'notifications', 'modular-upload',
		'rich-text-editor', 'toc-reader', 'context-menu', 'dialog-wrapper', 'hover-card', 'svelte5-primitives',
		'case-form', 'evidence-form', 'legal-layout', 'modals', 'celestial-icons', 'ui-components', 'nes-elements',
		'nes-routes', 'nes-strategy-guide', 'nier-showcase', 'yorha', 'nes-toast', 'yorha-terminal', 'retro-recommendations',
		'legal-spellbook', 'prosecutor-dashboard', 'detective-command', 'courtroom-sim', 'crime-reconstruction',
		'scene-intent-2d', 'evidence-canvas', 'collab-canvas', 'theory-board', 'investigate', 'particles',
		'evidence-dashboard', 'enhanced-upload', 'ai-file-upload', '/evidence-library', '/cases', 'nes-bits-ui',
	],
	gpu: ['webgpu-memory-palace', 'gpu-pipeline', 'webgpu-showcase'],
	graph: ['knowledge-graph', 'memory-palace', 'codebase-graph', 'nes-graph'],
	'machine-learning': [
		'ace-pipeline', 'case-scoring', 'document-summarizer', 'client-inference', 'contextual-chat', 'synthesis-chat',
		'agent-chat', 'ask-ai', 'client-ai-chat', 'ai-chat-test', 'ai-assistant', 'streaming', 'case-prediction',
		'yorha-assistant', 'chat-messages', '/admin/ai-dashboard', 'gemma4-mtp',
	],
	retrieval: [
		'vector-search', 'rag-documents', 'search-tools', 'citation-tools', 'source-drawer', 'chunks-ui',
		'embedding-stream', '/citations', '/legal-corpus',
	],
	test: [],
};

const SLUG_TO_DOMAIN: ReadonlyMap<string, DemoDomainId> = new Map(
	(Object.entries(GROUPS) as [DemoDomainId, readonly string[]][]).flatMap(([domain, slugs]) =>
		slugs.map((s) => [s, domain] as const),
	),
);

/** `/demos/vector-search` becomes `vector-search`; other app routes keep their leading slash. */
export function demoSlug(href: string): string {
	return href.startsWith('/demos/') ? href.slice('/demos/'.length) : href;
}

export function domainForDemo(href: string): DemoDomain {
	return SLUG_TO_DOMAIN.get(demoSlug(href)) ?? 'unclassified';
}

export function domainLabel(domain: DemoDomain): string {
	return domain === 'unclassified' ? 'Unclassified' : DEMO_DOMAINS[domain];
}

export interface SearchableDemo {
	href: string;
	label: string;
	description: string;
}

/** Case-insensitive match over label, description, slug and domain label; every query word must hit. */
export function demoMatchesQuery(demo: SearchableDemo, query: string): boolean {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;
	const haystack = [demo.label, demo.description, demoSlug(demo.href), domainLabel(domainForDemo(demo.href))]
		.join(' ')
		.toLowerCase();
	return words.every((w) => haystack.includes(w));
}
