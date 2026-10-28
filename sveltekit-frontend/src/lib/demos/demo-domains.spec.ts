// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEMO_DOMAINS, DEMO_TOPICS, demoMatchesQuery, demoSlug, domainLabel } from './demo-domains.js';
import { DEMO_ALIASES, DEMO_REGISTRY } from './demo-registry.js';

const routesDir = path.resolve('src/routes');
const demosDir = path.join(routesDir, '(app)/demos');

/** Resolve a URL path to a route directory, treating `(group)` folders as transparent. */
function routeHasPage(urlPath: string): boolean {
	const segments = urlPath.split('/').filter(Boolean);
	const walk = (dir: string, i: number): boolean => {
		if (i === segments.length) return ['+page.svelte', '+page.server.ts', '+page.ts'].some((f) => existsSync(path.join(dir, f)));
		const entries = readdirSync(dir).filter((e) => statSync(path.join(dir, e)).isDirectory());
		return entries.some(
			(e) => (e === segments[i] && walk(path.join(dir, e), i + 1)) || (/^\(.+\)$/.test(e) && walk(path.join(dir, e), i)),
		);
	};
	return walk(routesDir, 0);
}

describe('demo registry', () => {
	it('has one entry per (section, href) and 94 entries (84 demos + 10 showcases)', () => {
		const keys = DEMO_REGISTRY.map((d) => `${d.section}:${d.href}`);
		expect(new Set(keys).size).toBe(keys.length);
		expect(DEMO_REGISTRY.filter((d) => d.section === 'demos')).toHaveLength(84);
		expect(DEMO_REGISTRY.filter((d) => d.section === 'showcases')).toHaveLength(10);
	});

	it('lists only these routes in both sections', () => {
		const demos = new Set(DEMO_REGISTRY.filter((d) => d.section === 'demos').map((d) => d.href));
		const both = DEMO_REGISTRY.filter((d) => d.section === 'showcases' && demos.has(d.href)).map((d) => d.href).sort();
		expect(both).toEqual(['/demos/bits-ui', '/demos/evidence-canvas', '/demos/nier-showcase']);
	});

	it('resolves every listed route to a page, so no entry is silently dead', () => {
		const dead = [...new Set(DEMO_REGISTRY.map((d) => d.href))].filter((h) => !routeHasPage(h));
		expect(dead).toEqual([]);
	});

	it('uses only canonical ontology groups and known topics; ambiguous means more than one domain', () => {
		expect(Object.keys(DEMO_DOMAINS)).toHaveLength(13);
		for (const d of DEMO_REGISTRY) {
			expect(d.domains.every((x) => x in DEMO_DOMAINS), d.href).toBe(true);
			expect(new Set(d.domains).size, d.href).toBe(d.domains.length);
			expect(d.tags.every((t) => t in DEMO_TOPICS), d.href).toBe(true);
			expect(d.classification, d.href).toBe(d.domains.length > 1 ? 'ambiguous' : 'proposed');
		}
	});

	it('accounts for every demo directory (listed, a sub-route parent, or a redirect alias)', () => {
		const listed = new Set(DEMO_REGISTRY.map((d) => demoSlug(d.href).split('/')[0]));
		const aliases = new Set(DEMO_ALIASES.map((a) => demoSlug(a.href)));
		const dirs = readdirSync(demosDir).filter((d) => statSync(path.join(demosDir, d)).isDirectory());
		expect(dirs.filter((d) => !listed.has(d) && !aliases.has(d))).toEqual([]);
		for (const a of DEMO_ALIASES) expect(DEMO_REGISTRY.some((d) => d.href === a.redirectsTo)).toBe(true);
	});

	it('searches label, description, slug, domain labels and topic labels with all words required', () => {
		const d = DEMO_REGISTRY.find((x) => x.href === '/demos/vector-search')!;
		expect(demoMatchesQuery(d, '')).toBe(true);
		expect(demoMatchesQuery(d, 'pgvector semantic')).toBe(true);
		expect(demoMatchesQuery(d, 'information retrieval')).toBe(true); // domain label
		expect(demoMatchesQuery(d, 'rag')).toBe(true); // topic label
		expect(demoMatchesQuery(d, 'vector webgpu')).toBe(false);
		expect(domainLabel('unclassified')).toBe('Unclassified');
	});

	it('puts the requested topics on representative demos', () => {
		const tags = (h: string) => DEMO_REGISTRY.find((d) => d.href === h)!.tags;
		expect(tags('/demos/svelte5-primitives')).toContain('svelte5');
		expect(tags('/demos/agent-chat')).toEqual(expect.arrayContaining(['chat', 'agentic']));
		expect(tags('/demos/enhanced-upload')).toContain('upload');
		expect(tags('/demos/evidence-canvas')).toEqual(expect.arrayContaining(['evidence', 'visual']));
		expect(tags('/demos/rag-documents')).toContain('rag');
	});
});
