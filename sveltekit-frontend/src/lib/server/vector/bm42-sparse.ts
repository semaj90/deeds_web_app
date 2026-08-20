/**
 * Legacy hashed sparse lexical codec (standalone — no framework imports).
 *
 * Historical compatibility note:
 * this file is named `bm42-sparse.ts`, but the algorithm implemented here is
 * NOT Qdrant BM42. It hashes surface tokens with FNV-1a, weights them with
 * log(1 + TF), optionally boosts legal-looking tokens, then L2-normalizes.
 *
 * True Qdrant BM42 uses transformer attention-derived token importance plus
 * IDF. Do not label values from this file as BM42 in evaluation receipts.
 * The compatibility export `generateSparseVector()` remains until callers are
 * migrated to the explicit `generateLegacyHashedSparseVector()` name.
 */

export interface SparseVector {
	indices: number[];
	values: number[];
}

export const LEGACY_HASHED_SPARSE_ALGORITHM_ID = 'legacy_fnv1a_logtf_l2_v1' as const;

const STOP_WORDS = new Set([
	'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
	'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
	'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
	'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
	'through', 'after', 'before', 'above', 'below', 'and', 'or', 'not',
	'but', 'if', 'then', 'than', 'so', 'no', 'nor', 'too', 'very',
	'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
	'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both',
	'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
	'same', 'just', 'also', 'any', 'it', 'its',
]);

/** Hash a token string to a stable uint32 index (FNV-1a, vocabulary-free). */
function tokenToIndex(token: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < token.length; i++) {
		h ^= token.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) % 2_000_000;
}

/**
 * Generate the historical Atlas hashed sparse representation.
 *
 * This is a lexical challenger/compatibility codec, not BM25 and not BM42.
 */
export function generateLegacyHashedSparseVector(text: string): SparseVector {
	const tokens = text
		.toLowerCase()
		.replace(/[^\w\s§./-]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && !STOP_WORDS.has(t));

	if (tokens.length === 0) return { indices: [], values: [] };

	const tf = new Map<number, { count: number; isLegal: boolean }>();
	for (const token of tokens) {
		const idx = tokenToIndex(token);
		const isLegal = token.startsWith('§') || token.includes('u.s.c') || token.includes('cfr');
		const entry = tf.get(idx);
		if (entry) {
			entry.count += 1;
			if (isLegal) entry.isLegal = true;
		} else {
			tf.set(idx, { count: 1, isLegal });
		}
	}

	const indices: number[] = [];
	const values: number[] = [];
	for (const [idx, { count, isLegal }] of tf) {
		indices.push(idx);
		values.push(Math.log(1 + count) * (isLegal ? 2.0 : 1.0));
	}

	const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
	if (norm > 0) {
		for (let i = 0; i < values.length; i += 1) values[i] /= norm;
	}

	return { indices, values };
}

/** @deprecated Historical compatibility alias. Use generateLegacyHashedSparseVector. */
export function generateSparseVector(text: string): SparseVector {
	return generateLegacyHashedSparseVector(text);
}
