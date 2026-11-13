import { createHash } from 'node:crypto';
import { deriveUUID } from '$lib/utils/uuid.js';

/** Deterministic primary keys make replay of one immutable source generation idempotent. */
export const libraryIngestionIdentityV1 = Object.freeze({
	verifySourceBytes(bytes: Uint8Array, expectedSourceHash: string): string {
		if (!/^[a-f0-9]{64}$/i.test(expectedSourceHash)) throw new Error('LIBRARY_SOURCE_HASH_UNQUALIFIED');
		const actualSourceHash = createHash('sha256').update(bytes).digest('hex');
		if (actualSourceHash !== expectedSourceHash.toLowerCase()) throw new Error('LIBRARY_SOURCE_BYTES_HASH_MISMATCH');
		return actualSourceHash;
	},
	version(documentId: string, sourceHash: string): Promise<string> {
		return deriveUUID('legal.library.document-version.v1', { documentId, sourceHash });
	},
	node(input: { documentId: string; sourceHash: string; documentRevision: string; normalizedNodePath: string; parserRevision: string }): Promise<string> {
		return deriveUUID('legal.library.node.v1', {
			documentId: input.documentId,
			sourceHash: input.sourceHash,
			documentRevision: input.documentRevision,
			parserRevision: input.parserRevision,
			nodePath: input.normalizedNodePath,
		});
	},
	async chunk(input: {
		documentId: string;
		sourceHash: string;
		documentRevision: string;
		parserRevision: string;
		chunkHash: string;
		chunkIndex: number;
		pageStart: number | null;
		pageEnd: number | null;
		charStart: number;
		charEnd: number;
	}): Promise<string> {
		if (!Number.isSafeInteger(input.chunkIndex) || input.chunkIndex < 0) throw new Error('LIBRARY_CHUNK_INDEX_INVALID');
		if (!/^[a-f0-9]{64}$/i.test(input.chunkHash)) throw new Error('LIBRARY_CHUNK_HASH_INVALID');
		if (!Number.isSafeInteger(input.charStart) || !Number.isSafeInteger(input.charEnd) || input.charStart < 0 || input.charEnd < input.charStart) {
			throw new Error('LIBRARY_CHUNK_SPAN_INVALID');
		}
		for (const page of [input.pageStart, input.pageEnd]) {
			if (page !== null && (!Number.isSafeInteger(page) || page < 1)) throw new Error('LIBRARY_CHUNK_PAGE_INVALID');
		}
		return deriveUUID('legal.library.chunk.v1', {
			documentId: input.documentId,
			sourceHash: input.sourceHash,
			documentRevision: input.documentRevision,
			parserRevision: input.parserRevision,
			chunkHash: input.chunkHash.toLowerCase(),
			pageStart: input.pageStart === null ? 'unknown' : String(input.pageStart),
			pageEnd: input.pageEnd === null ? 'unknown' : String(input.pageEnd),
			charStart: String(input.charStart),
			charEnd: String(input.charEnd),
			chunkIndex: String(input.chunkIndex),
		});
	},
	definition(nodeId: string, normalizedTerm: string): Promise<string> {
		return deriveUUID('legal.library.definition.v1', { nodeId, normalizedTerm });
	},
});
