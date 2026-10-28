/**
 * Taxonomy for the demo index.
 *
 * DEMO_DOMAINS: the 13 top-level groups of `atlas_domain_ontology` (taxonomy_level 0) and the root rows of
 * `domain_taxonomy_v1`, read 2026-10-28. Navigation authority: use these IDs, not the 6-bucket engram remap.
 * DEMO_TOPICS: UI facets inside the large Frontend & UI group (Svelte 5 primitives, chat, evidence, upload,
 * visual, RAG, agentic, ...). They are NOT ontology groups. Per-demo assignment lives in `demo-registry.ts`
 * (proposed, not human reviewed, `canonicalAuthority: false`).
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

export const DEMO_TOPICS = {
	svelte5: "Svelte 5 & UI primitives",
	chat: "Chat & assistants",
	evidence: "Evidence & investigation",
	upload: "Upload",
	visual: "Visual, 3D & graphs",
	rag: "RAG & search",
	agentic: "Agentic",
	cases: "Cases & forms",
	'retro-theme': "NES / YoRHa theme",
} as const;

export type DemoTopicId = keyof typeof DEMO_TOPICS;

/** `/demos/vector-search` becomes `vector-search`; other app routes keep their leading slash. */
export function demoSlug(href: string): string {
	return href.startsWith('/demos/') ? href.slice('/demos/'.length) : href;
}

export function domainLabel(domain: DemoDomainId | 'unclassified'): string {
	return domain === 'unclassified' ? 'Unclassified' : DEMO_DOMAINS[domain];
}

export interface SearchableDemo {
	href: string;
	label: string;
	description: string;
	domains?: readonly DemoDomainId[];
	tags?: readonly DemoTopicId[];
}

/** Case-insensitive match over label, description, slug, domain labels and topic labels; every word must hit. */
export function demoMatchesQuery(demo: SearchableDemo, query: string): boolean {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return true;
	const haystack = [
		demo.label,
		demo.description,
		demoSlug(demo.href),
		...(demo.domains ?? []).map(domainLabel),
		...(demo.tags ?? []).map((t) => DEMO_TOPICS[t]),
	]
		.join(' ')
		.toLowerCase();
	return words.every((w) => haystack.includes(w));
}
