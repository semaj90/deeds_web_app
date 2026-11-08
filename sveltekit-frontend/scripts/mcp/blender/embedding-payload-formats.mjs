export const EMBEDDING_BITS_PER_ELEMENT = Object.freeze({
	FP32: 32,
	FP16: 16,
	BF16: 16,
	INT8: 8,
	PACKED_INT4: 4,
	PACKED_2BIT: 2,
	FP8_STORAGE_ONLY: 8
});

export function embeddingPayloadBytes(representation, dimensions) {
	const bits = EMBEDDING_BITS_PER_ELEMENT[representation];
	if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 65_536) {
		throw new RangeError('dimensions must be an integer from 1 to 65536');
	}
	if (!bits) throw new RangeError('unsupported embedding representation');
	return Math.ceil(dimensions * bits / 8);
}
