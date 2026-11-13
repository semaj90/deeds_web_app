import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { libraryIngestionIdentityV1 as identity } from './library-ingestion-identity-v1.js';

describe('library ingestion deterministic identity v1', () => {
	const documentId = '00000000-0000-4000-8000-000000000001';
	const sourceHash = 'a'.repeat(64);
	const chunkHash = 'c'.repeat(64);
	const documentRevision = '00000000-0000-4000-8000-000000000002';
	const chunkInput = (overrides: Partial<Parameters<typeof identity.chunk>[0]> = {}) => ({
		documentId, sourceHash, documentRevision, parserRevision: 'extract-v1', chunkHash, chunkIndex: 8,
		pageStart: 1, pageEnd: 1, charStart: 100, charEnd: 220, ...overrides,
	});

	it('reuses IDs across retries for the same source generation', async () => {
		const first = await Promise.all([
			identity.version(documentId, sourceHash),
			identity.node({ documentId, sourceHash, documentRevision, normalizedNodePath: 'title-1/section-a', parserRevision: 'extract-v1' }),
			identity.chunk(chunkInput()),
			identity.definition('00000000-0000-4000-8000-000000000002', 'notice'),
		]);
		const retry = await Promise.all([
			identity.version(documentId, sourceHash),
			identity.node({ documentId, sourceHash, documentRevision, normalizedNodePath: 'title-1/section-a', parserRevision: 'extract-v1' }),
			identity.chunk(chunkInput()),
			identity.definition('00000000-0000-4000-8000-000000000002', 'notice'),
		]);
		expect(retry).toEqual(first);
	});

	it('verifies fetched object bytes against the admitted source hash', () => {
		const sourceBytes = Buffer.from('%PDF-1.7 fixture bytes', 'utf8');
		const expectedHash = createHash('sha256').update(sourceBytes).digest('hex');
		expect(identity.verifySourceBytes(sourceBytes, expectedHash)).toBe(expectedHash);
		expect(() => identity.verifySourceBytes(sourceBytes, 'b'.repeat(64))).toThrow('LIBRARY_SOURCE_BYTES_HASH_MISMATCH');
		expect(() => identity.verifySourceBytes(sourceBytes, 'unqualified')).toThrow('LIBRARY_SOURCE_HASH_UNQUALIFIED');
	});

	it('changes content-derived identities when source revision or chunk ordinal changes', async () => {
		expect(await identity.chunk(chunkInput())).not.toBe(await identity.chunk(chunkInput({ sourceHash: 'b'.repeat(64) })));
		expect(await identity.chunk(chunkInput())).not.toBe(await identity.chunk(chunkInput({ chunkIndex: 9 })));
		expect(await identity.chunk(chunkInput())).not.toBe(await identity.chunk(chunkInput({ documentRevision: 'different-revision' })));
		expect(await identity.chunk(chunkInput())).not.toBe(await identity.chunk(chunkInput({ charStart: 101 })));
		expect(await identity.chunk(chunkInput())).not.toBe(await identity.chunk(chunkInput({ chunkHash: 'd'.repeat(64) })));
		expect(await identity.chunk(chunkInput())).not.toBe(await identity.chunk(chunkInput({ pageStart: 2, pageEnd: 2 })));
	});

	it('separates parser revisions for nodes and chunks of the same source bytes', async () => {
		expect(await identity.node({ documentId, sourceHash, documentRevision, normalizedNodePath: 'root', parserRevision: 'extract-v1' })).not.toBe(
			await identity.node({ documentId, sourceHash, documentRevision, normalizedNodePath: 'root', parserRevision: 'extract-v2' }),
		);
		expect(await identity.chunk(chunkInput({ parserRevision: 'extract-v1' }))).not.toBe(
			await identity.chunk(chunkInput({ parserRevision: 'extract-v2' })),
		);
	});

	it('rejects negative and non-integer chunk ordinals', async () => {
		await expect(identity.chunk(chunkInput({ chunkIndex: -1 }))).rejects.toThrow('LIBRARY_CHUNK_INDEX_INVALID');
		await expect(identity.chunk(chunkInput({ chunkIndex: 1.5 }))).rejects.toThrow('LIBRARY_CHUNK_INDEX_INVALID');
		await expect(identity.chunk(chunkInput({ chunkHash: 'invalid' }))).rejects.toThrow('LIBRARY_CHUNK_HASH_INVALID');
		await expect(identity.chunk(chunkInput({ charEnd: 99 }))).rejects.toThrow('LIBRARY_CHUNK_SPAN_INVALID');
		await expect(identity.chunk(chunkInput({ pageStart: 0 }))).rejects.toThrow('LIBRARY_CHUNK_PAGE_INVALID');
	});
});
