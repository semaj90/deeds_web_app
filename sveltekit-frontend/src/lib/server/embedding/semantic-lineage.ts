import { createHash } from 'node:crypto';
import { EMBEDDING_CONTRACT } from '$lib/server/embedding/embedding-contract.js';
import {
	SEMANTIC_DIMENSION,
	SEMANTIC_REPRESENTATION_ID,
} from '$lib/server/embedding/embedding-contract-768.js';

export const CANONICAL_SEMANTIC_REPRESENTATION_ID = SEMANTIC_REPRESENTATION_ID;
export const CANONICAL_SEMANTIC_DIMENSION = SEMANTIC_DIMENSION;
export const CANONICAL_SEMANTIC_REPRESENTATION_REVISION = 0 as const;
export const CANONICAL_SEMANTIC_ENCODER_REVISION =
	EMBEDDING_CONTRACT.representations.semantic_768.projection_version;

export interface CanonicalSemanticLineage {
	representationId: typeof CANONICAL_SEMANTIC_REPRESENTATION_ID;
	representationRevision: typeof CANONICAL_SEMANTIC_REPRESENTATION_REVISION;
	dimension: typeof CANONICAL_SEMANTIC_DIMENSION;
	encoderRevision: string;
	embeddingDigest: string;
}

export interface CanonicalSemanticLineageInput {
	vector: readonly number[] | Float32Array;
	encoderRevision: string;
	representationRevision?: number;
}

function asFloat32LittleEndianBytes(vector: readonly number[] | Float32Array): Uint8Array {
	const bytes = new Uint8Array(vector.length * 4);
	const view = new DataView(bytes.buffer);

	for (let index = 0; index < vector.length; index += 1) {
		view.setFloat32(index * 4, Number(vector[index]), true);
	}

	return bytes;
}

export function assertCanonicalSemanticEmbedding(
	vector: readonly number[] | Float32Array,
): asserts vector is readonly number[] {
	if (vector.length !== CANONICAL_SEMANTIC_DIMENSION) {
		throw new Error(
			`SEMANTIC_768_DIMENSION_MISMATCH: expected ${CANONICAL_SEMANTIC_DIMENSION}, received ${vector.length}`,
		);
	}

	for (let index = 0; index < vector.length; index += 1) {
		const value = Number(vector[index]);
		if (!Number.isFinite(value)) {
			throw new Error(`SEMANTIC_768_NON_FINITE_VALUE: index ${index} is ${String(value)}`);
		}
	}
}

export function digestSemanticEmbedding(vector: readonly number[] | Float32Array): string {
	assertCanonicalSemanticEmbedding(vector);
	return createHash('sha256').update(asFloat32LittleEndianBytes(vector)).digest('hex');
}

export function buildCanonicalSemanticLineage(
	input: CanonicalSemanticLineageInput,
): CanonicalSemanticLineage {
	const encoderRevision = input.encoderRevision.trim();
	if (!encoderRevision) {
		throw new Error('SEMANTIC_768_ENCODER_REVISION_REQUIRED');
	}

	assertCanonicalSemanticEmbedding(input.vector);

	return {
		representationId: CANONICAL_SEMANTIC_REPRESENTATION_ID,
		representationRevision: CANONICAL_SEMANTIC_REPRESENTATION_REVISION,
		dimension: CANONICAL_SEMANTIC_DIMENSION,
		encoderRevision,
		embeddingDigest: digestSemanticEmbedding(input.vector),
	};
}
