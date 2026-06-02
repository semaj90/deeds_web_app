/**
 * Query Expander — "Did you mean" + semantic term expansion.
 *
 * Uses the Redis 64-dim embedding sketches stored by search-analytics.ts
 * to find semantically similar prior queries via approximate dot-product.
 * Zero Qdrant calls — purely in-process Redis lookup.
 *
 * Returns:
 *   suggestion:     string | null  — best prior query if similarity > 0.82
 *   expansionTerms: string[]       — unique content words from similar prior queries
 *   expandedQuery:  string         — original query + expansion terms appended
 */
import {
	getAllQuerySketches,
	queryHash,
	recordSearchQuery,
	type HitPipeline,
} from '$lib/server/features/observability/index.js';

export interface QueryExpansion {
	suggestion:     string | null;
	expansionTerms: string[];
	expandedQuery:  string;
	/** Cosine similarity to the suggestion (0–1) */
	suggestionSim:  number;
}

// ── Approximate cosine on truncated 64-dim sketches ────────────────────────

function dotProduct(a: number[], b: number[]): number {
	let sum = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) sum += a[i] * b[i];
	return sum;
}

function l2Norm(a: number[]): number {
	let sum = 0;
	for (const v of a) sum += v * v;
	return Math.sqrt(sum) || 1;
}

function cosineSim(a: number[], b: number[]): number {
	return dotProduct(a, b) / (l2Norm(a) * l2Norm(b));
}

// ── Stop words for expansion term filtering ───────────────────────────────

const STOP_WORDS = new Set([
	'what', 'which', 'where', 'when', 'how', 'does', 'the', 'and', 'for',
	'are', 'this', 'that', 'with', 'from', 'have', 'been', 'will', 'can',
	'about', 'more', 'than', 'into', 'also', 'some', 'there', 'here',
]);

function extractContentWords(query: string): string[] {
	return query
		.toLowerCase()
		.split(/\W+/)
		.filter((w) => w.length > 4 && !STOP_WORDS.has(w));
}

// ── Main expander ──────────────────────────────────────────────────────────

/**
 * Expand an incoming query using stored embedding sketches from prior searches.
 *
 * @param query     The raw user query
 * @param embedding The 768-dim query embedding (already computed for retrieval)
 * @returns         QueryExpansion with suggestion + expansion terms
 */
export async function expandQuery(
	query: string,
	embedding: number[]
): Promise<QueryExpansion> {
	const result: QueryExpansion = {
		suggestion:     null,
		expansionTerms: [],
		expandedQuery:  query,
		suggestionSim:  0,
	};

	try {
		const sketch      = embedding.slice(0, 64);
		const allSketches = await getAllQuerySketches();

		const incomingHash = queryHash(query);
		let bestSim   = 0;
		let bestQuery = '';
		const termSet = new Set<string>();

		for (const { hash, query: storedQuery, sketch: storedSketch } of allSketches) {
			// Skip self
			if (hash === incomingHash || !storedQuery || !storedSketch) continue;

			const sim = cosineSim(sketch, storedSketch);

			// Suggestion threshold: very high similarity
			if (sim > 0.82 && sim > bestSim) {
				bestSim   = sim;
				bestQuery = storedQuery;
			}

			// Expansion threshold: broad semantic neighbourhood
			if (sim > 0.72) {
				for (const word of extractContentWords(storedQuery)) {
					termSet.add(word);
				}
			}
		}

		// Remove words already in the incoming query
		const incomingWords = new Set(extractContentWords(query));
		const newTerms = [...termSet]
			.filter((w) => !incomingWords.has(w))
			.slice(0, 5);

		result.suggestion     = bestSim > 0.82 ? bestQuery : null;
		result.expansionTerms = newTerms;
		result.suggestionSim  = bestSim;
		result.expandedQuery  = newTerms.length > 0
			? `${query} ${newTerms.join(' ')}`
			: query;
	} catch {
		// Non-fatal — return original query on any error
	}

	return result;
}

/**
 * Record the query into the analytics ring buffer then expand it.
 * Convenience wrapper for call sites that do both in one step.
 */
export async function recordAndExpand(opts: {
	query:     string;
	embedding: number[];
	pipeline:  HitPipeline;
	cacheHit:  boolean;
	userId?:   string;
}): Promise<QueryExpansion> {
	recordSearchQuery({
		query:    opts.query,
		embedding: opts.embedding,
		pipeline: opts.pipeline,
		cacheHit: opts.cacheHit,
		userId:   opts.userId,
	});
	return expandQuery(opts.query, opts.embedding);
}
