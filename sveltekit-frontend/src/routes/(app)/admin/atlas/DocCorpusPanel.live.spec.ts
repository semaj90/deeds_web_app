// @vitest-environment node
// Live (read-only) SSR proof: renders the panel from REAL canonical search results. Skipped unless ATLAS_LIVE_DOC_DB=1.
import 'dotenv/config';
import { render } from 'svelte/server';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import DocCorpusPanel from './DocCorpusPanel.svelte';
import { buildDocIntelligenceStudioSnapshotV1, findRepoRoot, searchDocCorpus } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';
import { readVerifiedCanonicalDocChunksV1 } from '$lib/server/atlas/docs/external-doc-citation-readback-v1.js';
import { buildExternalDocContextManifestV1 } from '$lib/server/atlas/docs/external-doc-context-manifest-v1.js';
import { verifyContextManifestV2Selection } from '$lib/server/atlas/graph/context-manifest-v2.js';
import { recommendFromOfficialDocReadbackV1 } from '$lib/server/atlas/docs/external-doc-dspy-v1.js';

const live = process.env.ATLAS_LIVE_DOC_DB === '1' && !!process.env.DATABASE_URL;

describe.skipIf(!live)('DocCorpusPanel SSR from live canonical Postgres (read-only)', () => {
	it.skipIf(process.env.ATLAS_LIVE_DOC_DSPY !== '1')('runs Predict on current official PostgreSQL citations', async () => {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
		try {
			const repoRoot = findRepoRoot();
			const query = 'What does hnsw.iterative_scan do in pgvector?';
			const search = await searchDocCorpus({ pool, root: repoRoot, q: 'hnsw.iterative_scan', limit: 2, canonicalOfficialOnly: true });
			const readback = await readVerifiedCanonicalDocChunksV1({ pool, hits: search.hits });
			expect(readback.status, JSON.stringify(readback.blockers)).toBe('VERIFIED');
			const result = await recommendFromOfficialDocReadbackV1({
				requestId: 'live-doc-dspy-proof', query, readback, repoRoot,
				python: process.env.PYTHON_PATH, llamaUrl: process.env.LLAMA_SERVER_URL,
			});
			expect(result.status, result.reason ?? undefined).toBe('EXACT_QUOTE_MATCH_REVIEW_REQUIRED');
			expect(result.recommendation?.claims.length).toBeGreaterThan(0);
		} finally { await pool.end(); }
	}, 55_000);

	it('renders CANONICAL provenance for a real hnsw.iterative_scan search and never reports an empty canonical corpus', async () => {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
		try {
			const snapshot = await buildDocIntelligenceStudioSnapshotV1({ pool });
			const search = await searchDocCorpus({ pool, root: findRepoRoot(), q: 'hnsw.iterative_scan', limit: 5 });
			const citations = await readVerifiedCanonicalDocChunksV1({ pool, hits: search.hits });
			expect(citations.status, JSON.stringify(citations.blockers)).toBe('VERIFIED');
			expect(citations.citations.length).toBeGreaterThan(0);
			expect(citations.citations.every((citation) => citation.sourceAuthority === 'OFFICIAL')).toBe(true);
			expect(citations.citations.every((citation) => Buffer.byteLength(citation.verifiedText, 'utf8') === citation.endByte - citation.startByte)).toBe(true);
			const manifest = buildExternalDocContextManifestV1({
				requestId: 'live-doc-corpus-proof', query: search.query, tokenBudget: 2048, readback: citations,
			});
			expect(manifest).not.toBeNull();
			expect(manifest!.v1.selectedNodeKeys).toEqual(citations.citations.map(({ chunkId }) => chunkId));
			expect(manifest!.v1.evidenceRefs).toEqual(citations.citations.map(({ chunkEvidenceRevision }) => chunkEvidenceRevision));
			verifyContextManifestV2Selection(manifest!, {
				snapshotId: manifest!.v1.snapshotId,
				ordinalMapChecksum: manifest!.identityInput.ordinalMapChecksum,
				selectedOrdinals: citations.citations.map((_, index) => index),
			});
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
