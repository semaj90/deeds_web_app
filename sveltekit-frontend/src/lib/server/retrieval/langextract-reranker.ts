/**
 * LangExtract Entity-Aware GRPO Reranker
 *
 * Multi-pass reranking inspired by the face-rerank 3-pass GRPO pattern:
 *
 *   Pass 1: Entity overlap scoring (LangExtract NER on query → entity match in chunks)
 *   Pass 2: Section relevance scoring (legal section type alignment)
 *   Pass 3: GRPO reward fusion (retrieval × entity × section weighted blend)
 *
 * Weights: 0.60 retrieval + 0.25 entity_overlap + 0.15 section_relevance
 *
 * Falls back gracefully: if LangExtract is unavailable, returns chunks unchanged.
 * Entity extraction is cached 5 minutes per query hash to avoid repeated calls.
 */

import { extractDocument, type LangExtractEntity } from '$lib/server/langextract-client.js';
import { getRedis } from '$lib/server/redis.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RerankableChunk {
	content: string;
	score: number;
	source: string;
	sectionType?: string;
	[key: string]: unknown;
}

export interface GRPORerankResult<T extends RerankableChunk = RerankableChunk> {
	chunk: T;
	/** Original retrieval score */
	retrievalScore: number;
	/** Pass 1: entity overlap ratio 0–1 */
	entityScore: number;
	/** Pass 2: section relevance 0–1 */
	sectionScore: number;
	/** Pass 3: GRPO-fused final score */
	grpoReward: number;
	/** Which entities from the query matched in this chunk */
	matchedEntities: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

/** GRPO fusion weights (sum = 1.0) */
const W_RETRIEVAL = 0.60;
const W_ENTITY = 0.25;
const W_SECTION = 0.15;

/** Redis cache TTL for query entity extraction */
const ENTITY_CACHE_TTL = 300; // 5 min
const ENTITY_CACHE_PREFIX = 'le:qent';

/** Legal section types ordered by typical query relevance */
const SECTION_RELEVANCE: Record<string, number> = {
	facts: 0.9,
	holding: 0.95,
	reasoning: 0.85,
	legal_authority: 0.9,
	claims: 0.8,
	issues: 0.8,
	citations: 0.7,
	judgment: 0.75,
	parties: 0.5,
	motions: 0.6,
	procedural_history: 0.4,
	sentencing: 0.65,
	bibliography: 0.3,
	prayer: 0.55,
	jurisdiction: 0.45,
};

// ── Pass 1: Entity Extraction + Overlap ──────────────────────────────────────

/**
 * Extract entities from query via LangExtract (spaCy NER).
 * Results are cached in Redis for 5 minutes per query hash.
 */
async function extractQueryEntities(query: string): Promise<LangExtractEntity[]> {
	// Check Redis cache first
	const { createHash } = await import('crypto');
	const qHash = createHash('md5').update(query).digest('hex').slice(0, 12);
	const cacheKey = `${ENTITY_CACHE_PREFIX}:${qHash}`;

	try {
		const redis = getRedis();
		const cached = await redis.get(cacheKey);
		if (cached) return JSON.parse(cached);
	} catch { /* Redis unavailable — continue */ }

	// Call LangExtract
	const result = await extractDocument(query, {
		documentType: 'legal',
		extractEntities: true,
		extractStructure: false,
	});

	const entities = result?.entities ?? [];

	// Cache result
	try {
		const redis = getRedis();
		await redis.set(cacheKey, JSON.stringify(entities), 'EX', ENTITY_CACHE_TTL);
	} catch { /* non-fatal */ }

	return entities;
}

/**
 * Score a chunk by how many query entities appear in its content.
 * Returns { score: 0–1, matchedEntities: string[] }
 */
function scoreEntityOverlap(
	chunkContent: string,
	queryEntities: LangExtractEntity[]
): { score: number; matched: string[] } {
	if (!queryEntities.length) return { score: 0, matched: [] };

	const contentLower = chunkContent.toLowerCase();
	const matched: string[] = [];

	for (const ent of queryEntities) {
		const needle = ent.text.toLowerCase();
		if (needle.length >= 3 && contentLower.includes(needle)) {
			matched.push(ent.text);
		}
	}

	// Normalize: ratio of matched entities, capped at 1.0
	const score = Math.min(1.0, matched.length / Math.max(1, queryEntities.length));
	return { score, matched };
}

// ── Pass 2: Section Relevance ────────────────────────────────────────────────

/**
 * Score a chunk by its legal section type relevance.
 * Chunks without section labels get a neutral 0.5.
 */
function scoreSectionRelevance(chunk: RerankableChunk, querySectionHints: string[]): number {
	const sectionType = chunk.sectionType?.toLowerCase();
	if (!sectionType) return 0.5; // neutral if no section info

	// Direct match: chunk's section is in the query's desired sections
	if (querySectionHints.length > 0) {
		const isDesired = querySectionHints.some(
			(h) => sectionType.includes(h) || h.includes(sectionType)
		);
		if (isDesired) return 1.0;
	}

	// Fallback: use static relevance map
	return SECTION_RELEVANCE[sectionType] ?? 0.5;
}

/**
 * Infer which section types the query is about based on keywords.
 */
function inferQuerySections(query: string): string[] {
	const q = query.toLowerCase();
	const hints: string[] = [];

	if (/held|holding|ruling|decided|conclusion/.test(q)) hints.push('holding');
	if (/fact|alleged|occurred|incident|timeline/.test(q)) hints.push('facts');
	if (/reason|analysis|court found|because/.test(q)) hints.push('reasoning');
	if (/statute|code|section \d|§|law/.test(q)) hints.push('legal_authority');
	if (/claim|cause of action|count|charge/.test(q)) hints.push('claims');
	if (/sentence|penalty|punishment|prison/.test(q)) hints.push('sentencing');
	if (/cite|citation|precedent|stare decisis/.test(q)) hints.push('citations');
	if (/motion|filed|petition|request/.test(q)) hints.push('motions');
	if (/evidence|exhibit|testimony|witness/.test(q)) hints.push('facts', 'reasoning');

	return Array.from(new Set(hints));
}

// ── Pass 3: GRPO Reward Fusion ───────────────────────────────────────────────

/**
 * Apply 3-pass GRPO-like reranking to retrieval chunks.
 *
 * Pass 1: LangExtract NER → entity overlap scoring
 * Pass 2: Section type relevance scoring
 * Pass 3: Weighted fusion (0.60 retrieval + 0.25 entity + 0.15 section)
 *
 * Falls back gracefully: if LangExtract is unavailable, entity scores are 0
 * and the retrieval score dominates (effectively a no-op rerank).
 *
 * @returns Chunks sorted by GRPO reward descending
 */
export async function rerankWithLangExtractGRPO<T extends RerankableChunk>(
	query: string,
	chunks: T[],
	options?: {
		/** Override section type hints (skip inference) */
		sectionTypes?: string[];
		/** Override fusion weights */
		weights?: { retrieval?: number; entity?: number; section?: number };
	}
): Promise<GRPORerankResult<T>[]> {
	if (!chunks.length) return [];

	const wR = options?.weights?.retrieval ?? W_RETRIEVAL;
	const wE = options?.weights?.entity ?? W_ENTITY;
	const wS = options?.weights?.section ?? W_SECTION;

	// Pass 1: Extract query entities via LangExtract (cached, non-blocking)
	const queryEntities = await extractQueryEntities(query).catch(() => [] as LangExtractEntity[]);

	// Pass 2: Infer section hints from query
	const sectionHints = options?.sectionTypes ?? inferQuerySections(query);

	// Pass 3: Score each chunk and fuse
	const results: GRPORerankResult<T>[] = chunks.map((chunk) => {
		const { score: entityScore, matched } = scoreEntityOverlap(chunk.content, queryEntities);
		const sectionScore = scoreSectionRelevance(chunk, sectionHints);
		const retrievalScore = chunk.score;

		const grpoReward = wR * retrievalScore + wE * entityScore + wS * sectionScore;

		return {
			chunk,
			retrievalScore,
			entityScore,
			sectionScore,
			grpoReward,
			matchedEntities: matched,
		};
	});

	// Sort by GRPO reward descending
	results.sort((a, b) => b.grpoReward - a.grpoReward);

	return results;
}

/**
 * Convenience: rerank and return just the chunks (drop scoring metadata).
 * Updates chunk.score to the GRPO reward for downstream consumers.
 */
export async function rerankChunksGRPO<T extends RerankableChunk>(
	query: string,
	chunks: T[],
	options?: Parameters<typeof rerankWithLangExtractGRPO>[2]
): Promise<T[]> {
	const results = await rerankWithLangExtractGRPO(query, chunks, options);
	return results.map((r) => ({
		...r.chunk,
		score: r.grpoReward,
	}));
}
