// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DocCorpusPanel from './DocCorpusPanel.svelte';
import type { DocIntelligenceStudioSnapshotV1, DocSearchResult } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';

const snapshot: DocIntelligenceStudioSnapshotV1 = {
	schema: 'atlas.doc-intelligence-studio-snapshot.v1',
	generatedAt: '2026-09-23T00:00:00.000Z',
	runtimeVersions: { postgres: '18.4 (Debian)', pgvector: '0.8.3', drizzleOrm: '0.45.2', drizzleKit: '0.31.10', pg: '8.16.0', svelte: '5.46.0', svelteKit: '2.59.1', bitsUi: '2.16.2' },
	manifestSources: [{ sourceId: 'postgresql-18', provider: 'postgresql', product: 'postgresql', pagesDeclared: 6, pagesCaptured: 6, qualification: 'MAJOR_VERSION' }],
	localCorpus: { authority: 'REFERENCE_ONLY', sourceCount: 7, pageCount: 31, capturedAt: '2026-09-23T16:17:03Z', staleSources: [], missingSources: [] },
	canonicalCorpus: { authority: 'CANONICAL_POSTGRES', status: 'EMPTY', pageCount: 0, chunkCount: 0, constraints: [] },
	versionDrift: [{ sourceId: 'postgresql-18', provider: 'postgresql', product: 'postgresql', runtimeVersion: '18.4', capturedDocVersion: '18', qualification: 'MAJOR_VERSION', status: 'COMPATIBLE_SERIES', pages: 6, capturedAt: '2026-09-23T16:17:03Z', authorityClass: 'OFFICIAL_PRIMARY' }],
	ftsCapability: { available: true, ginIndexes: ['aedc_fts_gin'], searchVectorGenerated: true },
	vectorCapability: { columnType: 'vector(768)', dimensions: 768, hnswIndex: true, opclass: 'vector_cosine_ops', halfvecType: true },
	aioCapability: { level: 'CAPABILITY', ioMethod: 'worker', effectiveIoConcurrency: '16', maintenanceIoConcurrency: '16', pgAiosAvailable: true, productionObserved: 'NOT_OBSERVED' },
	bitmapCapability: { capability: true, plannerSelected: true, productionObserved: 'NOT_OBSERVED', aioRelevant: true, fixtures: [] },
	langExtractStatus: { result: 'LANGEXTRACT_DOC_EVIDENCE_JOIN_BLOCKED', authority: 'GENERATED_CORPUS', documents: 7, blockers: [{ code: 'LANGEXTRACT_ROWS_LACK_DOC_COORDINATE', count: 7 }] },
	symbolIndexStatus: { result: 'AST_GREP_DOC_SYMBOL_MAPPING_INCOMPLETE', authority: 'GENERATED_CORPUS', methods: ['ast-grep', 'ts-morph'], codeBlocks: 0, symbols: 0, blockers: [] },
	analysisStatus: { contract: 'ExternalDocAnalysisV1', result: 'EXTERNAL_DOC_ANALYSIS_CONTRACT_READY', authority: 'DERIVED_ANALYSIS', persistedRows: null, ornithSummary: 'NOT_RUN', existingOwnerReviewed: 'x' },
	admissionHandoff: { result: 'DOC_ADMISSION_HANDOFF_BLOCKED', blockers: [{ code: 'CHUNK_EVIDENCE_REVISION_NOT_UNIQUE', count: 500 }], source: 'docs/reports/external-doc-studio-readiness-v1.json' },
	sources: [],
	issues: [{ code: 'DOC_CANONICAL_CORPUS_EMPTY', detail: 'atlas_external_doc_* has 0 admitted rows' }],
	validation: { status: 'PARTIAL', issues: [{ code: 'DOC_CANONICAL_CORPUS_EMPTY', detail: 'atlas_external_doc_* has 0 admitted rows' }] },
	canonicalAuthority: 'POSTGRES',
	generatedCorpusAuthority: false
};

const search: DocSearchResult = {
	query: 'io_method', mode: 'LOCAL_LEXICAL', postgresNote: 'DOC_CORPUS_POSTGRES_EMPTY',
	hits: [{ provider: 'postgresql', title: 'Resource Consumption', sourceId: 'postgresql-18', url: 'https://www.postgresql.org/docs/18/runtime-config-resource.html', product: 'postgresql', productVersion: '18', authorityClass: 'OFFICIAL_PRIMARY', revision: 'sha256:0123456789abcdef', excerpt: 'io_method = worker', badge: 'REFERENCE_ONLY', sourceClass: 'REFERENCE_ONLY', pageId: null, chunkId: null, chunkEvidenceRevision: null, headingPath: null }]
};

describe('DocCorpusPanel SSR (no client hydration)', () => {
	it('renders every server-loaded section as HTML', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search: null, query: '' } });
		for (const marker of ['data-testid="docs-corpus-panel"', 'Documentation Intelligence', 'docs-overview', 'docs-versions', 'docs-database', 'docs-analysis']) expect(body).toContain(marker);
		expect(body).toContain('0.45.2');
		expect(body).toContain('2.59.1');
		expect(body).toContain('PARTIAL · PG EMPTY');
		expect(body).toContain('COMPATIBLE_SERIES');
		expect(body).toContain('CAPABILITY');
		expect(body).toContain('PRODUCTION_OBSERVED NOT_OBSERVED');
		expect(body).toContain('CHUNK_EVIDENCE_REVISION_NOT_UNIQUE');
	});

	it('never implies an empty canonical table holds admitted documents', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search: null, query: '' } });
		expect(body).toContain('docs-canonical-note');
		expect(body).toContain('no page shown here has been admitted to PostgreSQL');
	});

	it('renders a plain GET search form and provenance-labelled noncanonical results without JS', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search, query: 'io_method' } });
		expect(body).toMatch(/<form[^>]*method="GET"/i);
		expect(body).toContain('type="search"');
		expect(body).toContain('REFERENCE_ONLY');
		expect(body).toContain('NONCANONICAL');
		expect(body).toContain('postgresql / postgresql @ 18');
		expect(body).toContain('sha256:0123456789abcdef');
		expect(body).not.toMatch(/>CANONICAL_POSTGRES</);
	});

	const canonicalSearch: DocSearchResult = {
		query: 'hnsw.iterative_scan', mode: 'POSTGRES_FTS', postgresNote: null, filters: { product: 'pgvector', productVersion: 'CURRENT_UPSTREAM@2026-09-23' },
		hits: [{ provider: 'pgvector', title: 'GitHub - pgvector/pgvector', sourceId: 'pgvector', url: 'https://github.com/pgvector/pgvector', product: 'pgvector', productVersion: 'CURRENT_UPSTREAM@2026-09-23', authorityClass: 'OFFICIAL',
			revision: 'sha256:pagerevision0000000000', excerpt: 'SET «hnsw.iterative_scan» = strict_order;', badge: 'CANONICAL_POSTGRES', sourceClass: 'CANONICAL', pageId: 'aaaaaaaa-1111-2222-3333-444444444444',
			chunkId: 'doc:pgvector:f9a6c0eb36814b08:12', chunkEvidenceRevision: 'sha256:chunkevidence1234567890abcdef', headingPath: ['Iterative Index Scans', 'HNSW'] }]
	};

	it('renders canonical Postgres hits with CANONICAL class, version and chunk/evidence provenance (server-side)', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search: canonicalSearch, query: 'hnsw.iterative_scan', product: 'pgvector', version: 'CURRENT_UPSTREAM@2026-09-23' } });
		expect(body).toContain('data-source-class="CANONICAL"');
		expect(body).toContain('SOURCE CANONICAL');
		expect(body).toContain('POSTGRES_FTS');
		expect(body).toContain('pgvector / pgvector @ CURRENT_UPSTREAM@2026-09-23');
		expect(body).toContain('docs-hit-provenance');
		expect(body).toContain('doc:pgvector:f9a6c0eb36814b08:12');
		expect(body).toContain('sha256:chunkevidenc…');
		expect(body).toContain('Iterative Index Scans › HNSW');
		expect(body).toContain('name="docprod"');
		expect(body).toContain('name="docver"');
		expect(body).toContain('filter pgvector @ CURRENT_UPSTREAM@2026-09-23');
		expect(body).not.toContain('NONCANONICAL');
	});

	it('renders a canonical zero-hit result as canonical (not a reference fallback)', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot, search: { ...canonicalSearch, hits: [] }, query: 'zzzz' } });
		expect(body).toContain('0 results');
		expect(body).toContain('SOURCE CANONICAL');
		expect(body).toContain('No matching documentation.');
		expect(body).not.toContain('NONCANONICAL');
	});

	it('marks a database-failure fallback as noncanonical with the reason visible', () => {
		const fallback: DocSearchResult = { ...search, postgresNote: 'POSTGRES_UNAVAILABLE:connection refused' };
		const { body } = render(DocCorpusPanel, { props: { snapshot, search: fallback, query: 'io_method' } });
		expect(body).toContain('POSTGRES_UNAVAILABLE:connection refused');
		expect(body).toContain('NONCANONICAL (local reference fallback, not canonical Postgres results)');
		expect(body).not.toContain('data-source-class="CANONICAL"');
	});

	it('degrades to an explicit unavailable state', () => {
		const { body } = render(DocCorpusPanel, { props: { snapshot: null, search: null, query: '' } });
		expect(body).toContain('SNAPSHOT_UNAVAILABLE');
		expect(body).toContain('docs-corpus-unavailable');
	});
});
