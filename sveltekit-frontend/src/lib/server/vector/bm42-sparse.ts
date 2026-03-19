/**
 * BM42 Sparse Vector Generator (standalone — no framework imports)
 *
 * Generates vocabulary-free sparse vectors using FNV-1a token hashing.
 * Used by:
 *   - qdrant-manager.ts (query-time hybrid search)
 *   - constitution-pipeline.ts (ingestion-time Qdrant upsert)
 *   - scripts/ingest-govinfo-federal.ts (standalone ingestion)
 *
 * Algorithm matches the Go search service's queryToBM42Sparse() in main.go
 * so that ingestion and query sparse vectors are hash-compatible.
 */

export interface SparseVector {
	indices: number[];
	values: number[];
}

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
	let h = 0x811c9dc5; // FNV-1a offset basis
	for (let i = 0; i < token.length; i++) {
		h ^= token.charCodeAt(i);
		h = Math.imul(h, 0x01000193); // FNV prime
	}
	return (h >>> 0) % 2_000_000; // Cap at 2M vocabulary slots
}

/**
 * Generate a BM42-style sparse vector from text.
 * Tokens are hashed to vocabulary indices; values are log(1 + TF) normalized.
 * Legal tokens (§, U.S.C., CFR) get 2x weight boost.
 */
export function generateSparseVector(text: string): SparseVector {
	const tokens = text
		.toLowerCase()
		.replace(/[^\w\s§./-]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && !STOP_WORDS.has(t));

	if (tokens.length === 0) return { indices: [], values: [] };

	// Count term frequencies
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

	// Build sparse vector with log(1+TF) weighting
	const indices: number[] = [];
	const values: number[] = [];
	for (const [idx, { count, isLegal }] of tf) {
		indices.push(idx);
		const weight = Math.log(1 + count) * (isLegal ? 2.0 : 1.0);
		values.push(weight);
	}

	// L2-normalize values
	const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
	if (norm > 0) {
		for (let i = 0; i < values.length; i++) values[i] /= norm;
	}

	return { indices, values };
}
