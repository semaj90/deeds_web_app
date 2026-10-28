// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEMO_DOMAINS, demoMatchesQuery, demoSlug, domainForDemo, domainLabel } from './demo-domains.js';

const demosDir = path.resolve('src/routes/(app)/demos');
const page = readFileSync(path.join(demosDir, '+page.svelte'), 'utf8');
const listed = [...page.matchAll(/\{ href: '([^']+)'/g)].map((m) => m[1]);

describe('demo domain taxonomy', () => {
	it('uses the 13 top-level ontology groups', () => {
		expect(Object.keys(DEMO_DOMAINS)).toHaveLength(13);
	});

	it('classifies every demo listed on the index page', () => {
		expect(listed.length).toBeGreaterThanOrEqual(80);
		const missing = listed.filter((h) => domainForDemo(h) === 'unclassified');
		expect(missing).toEqual([]);
	});

	it('classifies every demo directory (new demos must be added to the table)', () => {
		const dirs = readdirSync(demosDir).filter((d) => statSync(path.join(demosDir, d)).isDirectory());
		const missing = dirs.filter((d) => domainForDemo(`/demos/${d}`) === 'unclassified');
		expect(missing).toEqual([]);
	});

	it('does not guess for unknown demos', () => {
		expect(domainForDemo('/demos/not-a-real-demo')).toBe('unclassified');
		expect(domainLabel('unclassified')).toBe('Unclassified');
		expect(demoSlug('/cases')).toBe('/cases');
	});

	it('searches label, description, slug and domain label with all words required', () => {
		const d = { href: '/demos/vector-search', label: 'Vector Intelligence', description: 'Semantic search with pgvector' };
		expect(demoMatchesQuery(d, '')).toBe(true);
		expect(demoMatchesQuery(d, 'pgvector semantic')).toBe(true);
		expect(demoMatchesQuery(d, 'information retrieval')).toBe(true); // domain label
		expect(demoMatchesQuery(d, 'vector-search')).toBe(true); // slug
		expect(demoMatchesQuery(d, 'vector webgpu')).toBe(false);
	});
});
