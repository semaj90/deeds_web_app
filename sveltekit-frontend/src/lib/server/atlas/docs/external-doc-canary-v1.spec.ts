// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mapTransactionControl, selectCanaryEnvelopes, wrapClientAsSavepointPool } from './external-doc-canary-v1.js';
import { admitExternalDocPage, type ExternalDocAdmissionInputV1 } from './external-doc-admission.js';

describe('external-doc canary (no database)', () => {
	it('maps transaction control onto savepoints and leaves other SQL alone', () => {
		expect(mapTransactionControl('BEGIN')).toBe('SAVEPOINT atlas_doc_canary_sp');
		expect(mapTransactionControl(' commit; ')).toBe('RELEASE SAVEPOINT atlas_doc_canary_sp');
		expect(mapTransactionControl('ROLLBACK')).toBe('ROLLBACK TO SAVEPOINT atlas_doc_canary_sp');
		expect(mapTransactionControl('SELECT 1')).toBeNull();
	});

	it('the real admitExternalDocPage never issues a bare BEGIN/COMMIT through the wrapped pool', async () => {
		const seen: string[] = [];
		const fake = {
			async query(text: string) {
				seen.push(text.trim().split('\n')[0].slice(0, 60));
				if (/INSERT INTO atlas_external_doc_pages/.test(text)) return { rows: [{ id: 'page-1' }] };
				if (/FROM atlas_external_doc_pages WHERE id/.test(text)) return { rows: [PAGE_ROW] };
				if (/SELECT chunk_id, chunk_checksum/.test(text)) return { rows: [{ chunk_id: 'c0', chunk_checksum: CHECKSUM }] };
				return { rows: [] };
			}
		};
		const receipt = await admitExternalDocPage(wrapClientAsSavepointPool(fake) as never, INPUT);
		expect(receipt.chunkCount).toBe(1);
		expect(seen.some((s) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(s))).toBe(false);
		expect(seen[0]).toBe('SAVEPOINT atlas_doc_canary_sp');
		expect(seen[seen.length - 1]).toBe('RELEASE SAVEPOINT atlas_doc_canary_sp');
	});

	it('a writer failure rolls back to the savepoint only', async () => {
		const seen: string[] = [];
		const fake = {
			async query(text: string) {
				seen.push(text.trim().split('\n')[0].slice(0, 60));
				if (/INSERT INTO atlas_external_doc_pages/.test(text)) throw new Error('boom');
				return { rows: [] };
			}
		};
		await expect(admitExternalDocPage(wrapClientAsSavepointPool(fake) as never, INPUT)).rejects.toThrow('boom');
		expect(seen[seen.length - 1]).toBe('ROLLBACK TO SAVEPOINT atlas_doc_canary_sp');
	});

	it('selects one page per source deterministically', () => {
		const e = [
			{ sourceId: 'b', page: { url: 'https://x/2' } }, { sourceId: 'a', page: { url: 'https://x/9' } },
			{ sourceId: 'a', page: { url: 'https://x/1' } }, { sourceId: 'c', page: { url: 'https://x/3' } }, { sourceId: 'd', page: { url: 'https://x/4' } }
		];
		expect(selectCanaryEnvelopes(e, 3).map((x) => x.page.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
		expect(selectCanaryEnvelopes([...e].reverse(), 3).map((x) => x.page.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
	});
});

const TEXT = 'hello canary';
const CHECKSUM = createHash('sha256').update(TEXT, 'utf8').digest('hex');
const PAGE = {
	provider: 'p', product: 'q', productVersion: '1', architecture: null as string | null, language: null as string | null,
	url: 'https://example.test/doc', title: 't', publisher: null as string | null, sourceAuthority: 'OFFICIAL' as const, fetcher: 'f',
	crawlRevision: 'c', parserRevision: 'pr', contentHash: 'h'.repeat(64), evidenceRevision: 'e'.repeat(64), retrievedAt: '2026-09-23T00:00:00Z'
};
const PAGE_ROW = {
	provider: PAGE.provider, product: PAGE.product, product_version: PAGE.productVersion, architecture: null, crawl_revision: PAGE.crawlRevision,
	parser_revision: PAGE.parserRevision, url: PAGE.url, content_hash: PAGE.contentHash, evidence_revision: PAGE.evidenceRevision
};
const INPUT: ExternalDocAdmissionInputV1 = {
	manifestRevision: 'm', sourceRevision: 's', page: PAGE,
	chunks: [{
		chunkId: 'c0', ordinal: 0, headingPath: [], sectionAnchor: null, startChar: 0, endChar: TEXT.length, startByte: 0, endByte: TEXT.length,
		text: TEXT, domainClass: 'x', ontologyClasses: [], codeBlocks: [], apiSignatures: [], chunkChecksum: CHECKSUM, evidenceRevision: 'f'.repeat(64)
	}]
};
