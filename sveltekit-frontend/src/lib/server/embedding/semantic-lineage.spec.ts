import { describe, expect, it } from 'vitest';
import {
	assertCanonicalSemanticEmbedding,
	CANONICAL_SEMANTIC_ENCODER_REVISION,
	buildCanonicalSemanticLineage,
	digestSemanticEmbedding,
	CANONICAL_SEMANTIC_DIMENSION,
	CANONICAL_SEMANTIC_REPRESENTATION_ID,
	CANONICAL_SEMANTIC_REPRESENTATION_REVISION,
} from './semantic-lineage.js';

describe('semantic-lineage', () => {
	it('accepts a canonical 768-vector and produces a stable digest', () => {
		const vector = Array.from({ length: CANONICAL_SEMANTIC_DIMENSION }, (_, index) => index / 1000);

		expect(() => assertCanonicalSemanticEmbedding(vector)).not.toThrow();

		const lineage = buildCanonicalSemanticLineage({
			vector,
			encoderRevision: CANONICAL_SEMANTIC_ENCODER_REVISION,
		});

		expect(lineage.representationId).toBe(CANONICAL_SEMANTIC_REPRESENTATION_ID);
		expect(lineage.representationRevision).toBe(CANONICAL_SEMANTIC_REPRESENTATION_REVISION);
		expect(lineage.dimension).toBe(CANONICAL_SEMANTIC_DIMENSION);
		expect(lineage.encoderRevision).toBe(CANONICAL_SEMANTIC_ENCODER_REVISION);
		expect(lineage.embeddingDigest).toBe(digestSemanticEmbedding(vector));
		expect(lineage.embeddingDigest).toHaveLength(64);
	});

	it.each([
		{ label: '384', vector: Array.from({ length: 384 }, () => 0) },
		{ label: '512', vector: Array.from({ length: 512 }, () => 0) },
		{ label: 'NaN', vector: [...Array.from({ length: 767 }, () => 0), Number.NaN] },
		{ label: 'Infinity', vector: [...Array.from({ length: 767 }, () => 0), Number.POSITIVE_INFINITY] },
	])('rejects invalid canonical vectors: $label', ({ vector }) => {
		expect(() => assertCanonicalSemanticEmbedding(vector as number[])).toThrow();
		expect(() =>
			buildCanonicalSemanticLineage({
				vector: vector as number[],
				encoderRevision: CANONICAL_SEMANTIC_ENCODER_REVISION,
			}),
		).toThrow();
	});

	it('requires a non-empty encoder revision', () => {
		const vector = Array.from({ length: CANONICAL_SEMANTIC_DIMENSION }, () => 0);

		expect(() =>
			buildCanonicalSemanticLineage({
				vector,
				encoderRevision: '   ',
			}),
		).toThrow();
	});

	it('changes digest when the vector changes', () => {
		const a = Array.from({ length: CANONICAL_SEMANTIC_DIMENSION }, (_, index) => index / 1000);
		const b = [...a];
		b[0] = 0.12345;

		expect(digestSemanticEmbedding(a)).not.toBe(digestSemanticEmbedding(b));
	});
});
