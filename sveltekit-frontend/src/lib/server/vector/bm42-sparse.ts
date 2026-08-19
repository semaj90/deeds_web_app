/**
 * Legacy hashed sparse lexical vector generator (standalone — no framework imports).
 *
 * IMPORTANT: despite this historical filename, this is NOT the BM42 algorithm
 * described by Qdrant. Qdrant BM42 combines transformer attention-derived token
 * importance with IDF. This compatibility codec instead hashes tokens with
 * FNV-1a, applies log(1 + TF), an Atlas legal-token boost, then L2 normalizes.
 *
 * Keep this implementation only so previously indexed sparse vectors and the Go
 * search service remain query-compatible while Atlas migrates to explicitly
 * versioned BM25/BM42 sparse representations.
 */

export interface SparseVector {
	indices: number[];
	values: number[];
}

export const LEGACY_HASHED_SPARSE_ALGORITHM = 'atlas.legacy_hash_sparse.v1' as const;
export const LEGACY_HASHED_SPARSE_PROOF_STATE = 'DEGRADED_COMPATIBILITY' as const;

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
 * This function intentionally does not claim BM25 or BM42 semantics.
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
			entry.count++;
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

	const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
	if (norm > 0) {
		for (let i = 0; i < values.length; i++) values[i] /= norm;
	}

	return { indices, values };
}

/**
 * @deprecated Historical compatibility alias. Callers must not interpret the
 * returned vector as true BM42 evidence.
 */
export const generateSparseVector = generateLegacyHashedSparseVector;
