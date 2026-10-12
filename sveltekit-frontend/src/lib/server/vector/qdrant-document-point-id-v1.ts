import { v5 as uuidv5 } from 'uuid';
import { ATLAS_ROOT_NAMESPACE_V1 } from '$lib/server/atlas/identity/atlas-uuid-namespaces-v1.js';

export const QDRANT_DOCUMENT_POINT_NAMESPACE_V1 = uuidv5(
	'atlas.docs.point.v1',
	ATLAS_ROOT_NAMESPACE_V1,
);

export interface QdrantDocumentPointIdentityV1 {
	packetKey: string;
	chunkId: string;
	sourceRevision: string;
	representationRevision: string;
	embeddingModelRevision: string;
}

const IDENTITY_FIELDS = [
	'packetKey',
	'chunkId',
	'sourceRevision',
	'representationRevision',
	'embeddingModelRevision',
] as const satisfies readonly (keyof QdrantDocumentPointIdentityV1)[];

function assertIdentityValue(field: string, value: unknown): asserts value is string {
	if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.includes('\u0000')) {
		throw new TypeError(`QDRANT_DOCUMENT_POINT_IDENTITY_INVALID:${field}`);
	}
}

export function canonicalQdrantDocumentPointNameV1(
	identity: QdrantDocumentPointIdentityV1,
): string {
	const values = IDENTITY_FIELDS.map((field) => {
		const value = identity[field];
		assertIdentityValue(field, value);
		return value;
	});

	return [
		'atlas.qdrant.document-point.v1',
		...values.map((value) => {
			const byteLength = Buffer.byteLength(value, 'utf8');
			return `${byteLength}:${value}`;
		}),
	].join('|');
}

export function deterministicQdrantDocumentPointIdV1(
	identity: QdrantDocumentPointIdentityV1,
): string {
	return uuidv5(canonicalQdrantDocumentPointNameV1(identity), QDRANT_DOCUMENT_POINT_NAMESPACE_V1);
}

export function describeQdrantDocumentPointIdentityV1(
	identity: QdrantDocumentPointIdentityV1,
): {
	uuidAlgorithm: 'UUIDv5';
	uuidNamespace: string;
	uuidName: string;
	canonicalIdentity: false;
} {
	return {
		uuidAlgorithm: 'UUIDv5',
		uuidNamespace: QDRANT_DOCUMENT_POINT_NAMESPACE_V1,
		uuidName: canonicalQdrantDocumentPointNameV1(identity),
		canonicalIdentity: false,
	};
}
