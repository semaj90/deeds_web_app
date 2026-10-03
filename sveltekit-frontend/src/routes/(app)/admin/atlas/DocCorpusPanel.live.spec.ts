// @vitest-environment node
// Live (read-only) SSR proof: renders the panel from REAL canonical search results. Skipped unless ATLAS_LIVE_DOC_DB=1.
import 'dotenv/config';
import { render } from 'svelte/server';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import DocCorpusPanel from './DocCorpusPanel.svelte';
import { buildDocIntelligenceStudioSnapshotV1, findRepoRoot, searchDocCorpus } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';

const live = process.env.ATLAS_LIVE_DOC_DB === '1' && !!process.env.DATABASE_URL;

describe.skipIf(!live)('DocCorpusPanel SSR from live canonical Postgres (read-only)', () => {
	it('renders CANONICAL provenance for a real hnsw.iterative_scan search and never reports an empty canonical corpus', async () => {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
		try {
			const snapshot = await buildDocIntelligenceStudioSnapshotV1({ pool });
			const search = await searchDocCorpus({ pool, root: findRepoRoot(), q: 'hnsw.iterative_scan', limit: 5 });
			const { body } = render(DocCorpusPanel, { props: { snapshot, search, query: 'hnsw.iterative_scan', product: '', version: '' } });
			expect(snapshot.canonicalCorpus.status).toBe('PRESENT');
			expect(body).not.toContain('DOC_CANONICAL_CORPUS_EMPTY');
			expect(body).toContain('data-source-class="CANONICAL"');
			expect(body).toContain('SOURCE CANONICAL');
			expect(body).toContain('docs-hit-provenance');
			expect(body).toContain('doc:pgvector:');
			expect(body).toContain('CURRENT_UPSTREAM@');
			expect(body).not.toContain('NONCANONICAL');
		} finally { await pool.end(); }
	});
});
