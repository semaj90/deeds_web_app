// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DocSearchHit } from './doc-intelligence-read-model.js';
import { chunkEvidenceRevisionV1 } from './external-doc-intelligence-contracts-v1.js';
import { readVerifiedCanonicalDocChunksV1 } from './external-doc-citation-readback-v1.js';

const pageRevision = `sha256:${'a'.repeat(64)}`;
const text = 'Résumé 🔍: Firecrawl v2 scrape returns JSON.';
const chunkChecksum = createHash('sha256').update(text, 'utf8').digest('hex');
const startByte = 0;
const endByte = Buffer.byteLength(text, 'utf8');
const chunkEvidenceRevision = chunkEvidenceRevisionV1(pageRevision, {
	ordinal: 3, startByte, endByte, chunkChecksum,
});

const hit = (overrides: Partial<DocSearchHit> = {}): DocSearchHit => ({
	provider: 'firecrawl', title: 'Firecrawl scrape API', sourceId: 'firecrawl-v2',
	url: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', product: 'firecrawl',
	productVersion: 'v2', authorityClass: 'OFFICIAL', revision: pageRevision,
	excerpt: 'untrusted search headline excerpt', badge: 'OFFICIAL', sourceClass: 'CANONICAL',
	pageId: 'page-1', chunkId: 'chunk-1', chunkEvidenceRevision, headingPath: ['Scrape'],
	...overrides,
});

function row(overrides: Record<string, unknown> = {}) {
	return {
		chunk_id: 'chunk-1', page_id: 'page-1', ordinal: 3, start_byte: startByte, end_byte: endByte,
		text, chunk_checksum: chunkChecksum, chunk_evidence_revision: chunkEvidenceRevision,
		url: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', provider: 'firecrawl',
		product: 'firecrawl', product_version: 'v2', source_authority: 'OFFICIAL',
		page_evidence_revision: pageRevision, ...overrides,
	};
}

function poolWith(rows: ReturnType<typeof row>[]) {
	return { query: vi.fn().mockResolvedValue({ rows }) } as never;
}

describe('canonical official documentation citation readback', () => {
	it('returns exact current UTF-8 chunk bytes, not the FTS excerpt', async () => {
		const pool = poolWith([row()]);
		const result = await readVerifiedCanonicalDocChunksV1({ pool, hits: [hit()] });
		expect(result.status).toBe('VERIFIED');
		expect(result.citations[0]).toMatchObject({
			chunkId: 'chunk-1', sourceRevision: pageRevision, chunkEvidenceRevision,
			startByte, endByte, chunkChecksum, verifiedText: text, canonicalAuthority: false,
		});
		expect(result.citations[0].verifiedText).not.toBe(hit().excerpt);
		expect(result.writesPerformed).toBe(false);
	});

	it('blocks a stale search revision and does not return citation text', async () => {
		const result = await readVerifiedCanonicalDocChunksV1({
			pool: poolWith([row()]), hits: [hit({ revision: `sha256:${'b'.repeat(64)}` })],
		});
		expect(result.status).toBe('BLOCKED');
		expect(result.citations).toEqual([]);
		expect(result.blockers).toContainEqual({ chunkId: 'chunk-1', reason: 'CANONICAL_PAGE_OR_CHUNK_REVISION_CHANGED' });
	});

	it('blocks a corrupted canonical chunk checksum', async () => {
		const result = await readVerifiedCanonicalDocChunksV1({
			pool: poolWith([row({ chunk_checksum: '0'.repeat(64) })]), hits: [hit()],
		});
		expect(result.status).toBe('BLOCKED');
		expect(result.citations).toEqual([]);
		expect(result.blockers).toContainEqual({ chunkId: 'chunk-1', reason: 'CANONICAL_CHUNK_CHECKSUM_MISMATCH' });
	});

	it('withholds every citation when a selected row has a changed product version', async () => {
		const result = await readVerifiedCanonicalDocChunksV1({
			pool: poolWith([row(), row({ chunk_id: 'chunk-2', product_version: 'v1' })]),
			hits: [hit(), hit({ chunkId: 'chunk-2' })],
		});
		expect(result.status).toBe('BLOCKED');
		expect(result.citations).toEqual([]);
		expect(result.blockers).toContainEqual({ chunkId: 'chunk-2', reason: 'CANONICAL_PAGE_OR_CHUNK_REVISION_CHANGED' });
	});

	it('blocks duplicate or unselected database rows', async () => {
		for (const rows of [[row(), row()], [row(), row({ chunk_id: 'chunk-unselected' })]]) {
			const result = await readVerifiedCanonicalDocChunksV1({ pool: poolWith(rows), hits: [hit()] });
			expect(result.status).toBe('BLOCKED');
			expect(result.citations).toEqual([]);
			expect(result.blockers[0].reason).toBe('CANONICAL_CHUNK_READBACK_SELECTION_MISMATCH');
		}
	});

	it('rejects noncanonical and nonofficial retrieval hits before SQL', async () => {
		const query = vi.fn();
		const result = await readVerifiedCanonicalDocChunksV1({
			pool: { query } as never,
			hits: [hit({ sourceClass: 'REFERENCE_ONLY' }), hit({ authorityClass: 'COMMUNITY' })],
		});
		expect(result.status).toBe('BLOCKED');
		expect(result.citations).toEqual([]);
		expect(query).not.toHaveBeenCalled();
	});
});
