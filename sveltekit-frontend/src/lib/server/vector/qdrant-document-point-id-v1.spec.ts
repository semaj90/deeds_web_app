import { describe, expect, it } from 'vitest';
import {
	canonicalQdrantDocumentPointNameV1,
	deterministicQdrantDocumentPointIdV1,
	describeQdrantDocumentPointIdentityV1,
	QDRANT_DOCUMENT_POINT_NAMESPACE_V1,
	type QdrantDocumentPointIdentityV1,
} from './qdrant-document-point-id-v1.js';

const identity: QdrantDocumentPointIdentityV1 = {
	packetKey: 'packet:source-a',
	chunkId: 'chunk:0',
	sourceRevision: 'sha256:' + 'a'.repeat(64),
	representationRevision: 'semantic_768:v1',
	embeddingModelRevision: 'embeddinggemma:revision-1',
};

describe('Qdrant document point UUIDv5 identity', () => {
	it('is deterministic under the frozen document namespace', () => {
		expect(deterministicQdrantDocumentPointIdV1(identity)).toBe(
			deterministicQdrantDocumentPointIdV1({ ...identity }),
		);
		expect(deterministicQdrantDocumentPointIdV1(identity)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(QDRANT_DOCUMENT_POINT_NAMESPACE_V1).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it('changes when any revision-qualified identity field changes', () => {
		for (const field of Object.keys(identity) as (keyof QdrantDocumentPointIdentityV1)[]) {
			const changed = { ...identity, [field]: `${identity[field]}:changed` };
			expect(deterministicQdrantDocumentPointIdV1(changed)).not.toBe(
				deterministicQdrantDocumentPointIdV1(identity),
			);
		}
	});

	it('length-frames UTF-8 fields and rejects missing or noncanonical values', () => {
		const unicode = { ...identity, chunkId: 'chunk:é|1' };
		expect(canonicalQdrantDocumentPointNameV1(unicode)).toContain(`${Buffer.byteLength(unicode.chunkId, 'utf8')}:`);
		expect(() => deterministicQdrantDocumentPointIdV1({ ...identity, packetKey: '' })).toThrow(
			'QDRANT_DOCUMENT_POINT_IDENTITY_INVALID:packetKey',
		);
		expect(() => deterministicQdrantDocumentPointIdV1({ ...identity, chunkId: ' chunk:0' })).toThrow(
			'QDRANT_DOCUMENT_POINT_IDENTITY_INVALID:chunkId',
		);
	});

	it('describes the UUID as a derived index key, not canonical identity', () => {
		expect(describeQdrantDocumentPointIdentityV1(identity)).toEqual({
			uuidAlgorithm: 'UUIDv5',
			uuidNamespace: QDRANT_DOCUMENT_POINT_NAMESPACE_V1,
			uuidName: canonicalQdrantDocumentPointNameV1(identity),
			canonicalIdentity: false,
		});
	});
});
