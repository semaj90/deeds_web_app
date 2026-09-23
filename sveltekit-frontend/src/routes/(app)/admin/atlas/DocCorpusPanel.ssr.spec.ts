// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DocCorpusPanel from './DocCorpusPanel.svelte';
import type { DocCorpusStudioSnapshotV1, DocSearchResult } from '$lib/server/atlas/docs/doc-corpus-studio-read.js';

const snapshot: DocCorpusStudioSnapshotV1 = {
	schema: 'atlas.doc-corpus-studio-snapshot.v1',
	generatedAt: '2026-09-23T00:00:00.000Z',
	runtimeVersions: { postgres: '18.4 (Debian)', pgvector: '0.8.3', drizzleOrm: '0.45.2', drizzleKit: '0.31.10', pg: '^8.0.0' },
	localCorpus: { sourceCount: 7, pageCount: 22, capturedAt: '2026-09-23T16:17:03Z', staleSources: [], missingSources: [] },
	postgresCorpus: { pageCount: 0, chunkCount: 0, ftsAvailable: true, vectorColumnAvailable: true, indexes: [], status: 'EMPTY' },
	capabilities: {
		aio: { ioMethod: 'worker', pgAiosAvailable: true },
		bitmap: { plannerCanGenerateBitmap: true, plannerSelectedBitmap: true, aioRelevant: true, ioMethod: 'worker', fixtures: [] },
		hnsw: true, halfvec: true
	},
	coverage: [{ group: 'postgresql18', status: 'CAPTURED_CURRENT', bestQualification: 'MAJOR_VERSION_PIN', runtimeCompatibility: 'MATCH', captures: 4 }],
	sources: [],
	validation: { status: 'PARTIAL', issues: [{ code: 'DOC_CORPUS_POSTGRES_EMPTY', detail: 'atlas_external_doc_* has 0 admitted rows' }] },
	canonicalAuthority: 'POSTGRES',
	generatedCorpusAuthority: false
};

const search: DocSearchResult = {
	query: 'io_method', mode: 'LOCAL_LEXICAL', postgresNote: 'DOC_CORPUS_POSTGRES_EMPTY',
	hits: [{ title: 'Resource Consumption', sourceId: 'postgresql-18', url: 'https://www.postgresql.org/docs/18/runtime-config-resource.html', product: null, productVersion: null, authorityClass: 'OFFICIAL_PRIMARY', revision: 'sha256:0123456789abcdef', excerpt: 'io_method = worker', badge: 'REFERENCE_ONLY' }]
};

describe('DocCorpusPanel SSR (no client hydration)', () => {
	it('renders the server-loaded snapshot as HTML', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search: null, query: '' } });
		expect(body).toContain('data-testid="docs-corpus-panel"');
		expect(body).toContain('Documentation Corpus');
		expect(body).toContain('0.45.2');
		expect(body).toContain('18.4');
		expect(body).toContain('PARTIAL · PG EMPTY');
		expect(body).toContain('postgresql18');
		expect(body).toContain('DOC_CORPUS_POSTGRES_EMPTY');
	});

	it('renders a plain GET search form and provenance-labelled results without JS', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search, query: 'io_method' } });
		expect(body).toMatch(/<form[^>]*method="GET"/i);
		expect(body).toContain('type="search"');
		expect(body).toContain('REFERENCE_ONLY');
		expect(body).toContain('sha256:0123456789abcdef');
		expect(body).not.toMatch(/>CANONICAL</);
	});

	it('degrades to an explicit unavailable state', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot: null, search: null, query: '' } });
		expect(body).toContain('SNAPSHOT_UNAVAILABLE');
		expect(body).toContain('docs-corpus-unavailable');
	});
});
