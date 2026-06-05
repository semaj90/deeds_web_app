import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import type Redis from 'ioredis';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { getRedis } from '$lib/server/redis.js';
import { buildSemanticCacheKey, storeSemanticCacheRecord } from './semantic-cache.js';

const EXACT_PREFIX = 'atlas:summary:exact:v1:';
const SEMANTIC_PREFIX = 'atlas:summary:semantic:v1:';
const SEMANTIC_INDEX_KEY = 'atlas:summary:semantic:index:v1';
const SOURCE_REF_PREFIX = 'atlas:summary:source_ref:v1:';
const FEATURE_INDEX_PREFIX = 'atlas:summary:feature:v1:';
const DEFAULT_PROMPT_VERSION = 'phase101-summary-v1';
const DEFAULT_INTENT = 'summary';
const DEFAULT_MODEL = 'gemma4-rotorquant:latest';
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const SEMANTIC_THRESHOLD = 0.95;
const SEMANTIC_SCAN_LIMIT = 100;

let cachedRepoRevision: string | null = null;

export interface Phase101SummarySection {
	title: string;
	content: string;
}

export interface Phase101SummaryInput {
	documentId: string;
	sections: Phase101SummarySection[];
	keyInsights: string[];
	sourceRefs?: string[];
	featureIds?: string[];
	laneIds?: string[];
	semanticEmbedding?: number[];
	intent?: string;
	model?: string;
	promptVersion?: string;
	repoRevision?: string;
}

export interface Phase101SummarySynthesis {
	mainThemes: string[];
	supportingEvidence: string[];
	gaps: string[];
	contradictions: string[];
	legalImplications: string[];
	nextSteps: string[];
}

export interface Phase101SummaryGeneration {
	rawText: string;
	synthesis: Phase101SummarySynthesis;
	semanticEmbedding?: number[];
}

export interface Phase101SummaryRetrieval {
	exactCacheHit: boolean;
	semanticCacheHit: boolean;
	qdrantHits: unknown[];
	turboVecHits: unknown[];
}

export interface Phase101SummaryPacket {
	packetId: string;
	queryHash: string;
	contentHash: string;
	repoRevision: string;
	model: string;
	promptVersion: string;
	intent: string;
	sourceRefs: string[];
	featureIds: string[];
	laneIds: string[];
	summary: string;
	lod0Tags: string[];
	lod1Summary: string;
	lod2Summary: string;
	recommendations: string[];
	risks: string[];
	retrieval: Phase101SummaryRetrieval;
	synthesis: Phase101SummarySynthesis;
	createdAt: string;
	hitCount: number;
}

export interface Phase101SummaryCacheResult {
	packet: Phase101SummaryPacket;
	cache: 'exact' | 'semantic' | 'miss';
	exactCacheKey: string;
	semanticCacheKey?: string;
}

export interface Phase101SummaryStoredRecord {
	packet: Phase101SummaryPacket;
	cacheText: string;
	exactCacheKey: string;
	queryHash: string;
	contentHash: string;
	hitCount: number;
	cachedAt: string;
}

export interface Phase101SummaryCacheContext {
	cacheText: string;
	model: string;
	promptVersion: string;
	intent: string;
	repoRevision: string;
	sourceRefs: string[];
	featureIds: string[];
	exactCacheKey: string;
	queryHash: string;
	contentHash: string;
	semanticEmbedding?: number[];
}

export type Phase101SummaryGenerator = (
	context: Phase101SummaryCacheContext
) => Promise<Phase101SummaryGeneration>;

function normalizeText(input: string): string {
	return input.replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function sha256(text: string): string {
	return crypto.createHash('sha256').update(text).digest('hex');
}

function shortHash(text: string, length = 16): string {
	return sha256(text).slice(0, length);
}

function sourceRefIndexKey(sourceRef: string): string {
	return `${SOURCE_REF_PREFIX}${shortHash(sourceRef, 24)}`;
}

function featureIndexKey(featureId: string): string {
	return `${FEATURE_INDEX_PREFIX}${shortHash(featureId, 24)}`;
}

function semanticIndexKey(packetId: string): string {
	return `${SEMANTIC_PREFIX}${packetId}`;
}

function buildPromptCacheText(input: Phase101SummaryInput): string {
	const sections = input.sections
		.map((section) => `${section.title.trim()}: ${section.content.trim()}`)
		.join('\n\n');
	const keyInsights = input.keyInsights.length > 0 ? `Key insights: ${input.keyInsights.join('; ')}` : '';
	return normalizeText([sections, keyInsights].filter(Boolean).join('\n\n'));
}

function buildQueryHash(input: Phase101SummaryInput, cacheText: string, repoRevision: string): string {
	const sourceRefs = uniqueStrings([...(input.sourceRefs ?? []), input.documentId]);
	const featureIds = uniqueStrings(input.featureIds ?? []);
	return sha256(
		[
			normalizeText(cacheText),
			repoRevision,
			(input.model ?? DEFAULT_MODEL).trim(),
			(input.promptVersion ?? DEFAULT_PROMPT_VERSION).trim(),
			(input.intent ?? DEFAULT_INTENT).trim(),
			sourceRefs.join('|'),
			featureIds.join('|'),
		].join('\n')
	);
}

function buildContentHash(cacheText: string): string {
	return sha256(normalizeText(cacheText));
}

function buildPacketId(queryHash: string): string {
	return `sum:${queryHash.slice(0, 16)}`;
}

function buildSummaryText(synthesis: Phase101SummarySynthesis, fallback: string): string {
	const primary = synthesis.mainThemes[0]?.trim();
	if (primary) return primary;
	const secondary = synthesis.nextSteps[0]?.trim();
	if (secondary) return secondary;
	return fallback.slice(0, 280);
}

function buildLod1Summary(synthesis: Phase101SummarySynthesis): string {
	return normalizeText(synthesis.mainThemes.join('; ')).slice(0, 1000);
}

function buildLod2Summary(synthesis: Phase101SummarySynthesis): string {
	return normalizeText(
		[
			...synthesis.supportingEvidence,
			...synthesis.gaps,
			...synthesis.contradictions,
			...synthesis.legalImplications,
		].join(' | ')
	).slice(0, 1500);
}

function buildLod0Tags(input: Phase101SummaryInput, synthesis: Phase101SummarySynthesis): string[] {
	return uniqueStrings([...input.keyInsights, ...synthesis.mainThemes]).slice(0, 12);
}

function buildSemanticCacheRecord(packet: Phase101SummaryPacket): {
	queryHash: string;
	semanticCacheKey: string;
	model: string;
	provider: string;
	sourceRefs: string[];
	chunkIds: string[];
	contextPackKey: string;
	responseHash: string;
	createdAt: string;
	ttlSeconds: number;
	metadata: Record<string, unknown>;
} {
	const provider = 'llama-server';
	return {
		queryHash: packet.queryHash,
		semanticCacheKey: buildSemanticCacheKey(packet.queryHash, packet.model, provider),
		model: packet.model,
		provider,
		sourceRefs: packet.sourceRefs,
		chunkIds: packet.sourceRefs,
		contextPackKey: `ace:ctx:${packet.packetId}`,
		responseHash: packet.contentHash,
		createdAt: packet.createdAt,
		ttlSeconds: DEFAULT_TTL_SECONDS,
		metadata: {
			packetId: packet.packetId,
			repoRevision: packet.repoRevision,
			intent: packet.intent,
			promptVersion: packet.promptVersion,
			laneIds: packet.laneIds,
			retrieval: packet.retrieval,
		},
	};
}

async function resolveRepoRevision(explicitRevision?: string): Promise<string> {
	if (explicitRevision?.trim()) return explicitRevision.trim();
	if (cachedRepoRevision) return cachedRepoRevision;
	const envRevision =
		process.env.REPO_REVISION?.trim() ||
		process.env.GIT_SHA?.trim() ||
		process.env.GITHUB_SHA?.trim() ||
		process.env.CI_COMMIT_SHA?.trim();
	if (envRevision) {
		cachedRepoRevision = envRevision;
		return envRevision;
	}
	try {
		const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: process.cwd(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		const value = String(rev.stdout ?? '').trim();
		if (value) {
			cachedRepoRevision = value;
			return value;
		}
	} catch {
		// fall through
	}
	cachedRepoRevision = 'local';
	return 'local';
}

export function buildPhase101SummaryCacheText(input: Phase101SummaryInput): string {
	return buildPromptCacheText(input);
}

export function buildPhase101SummaryCacheKey(input: Phase101SummaryInput, repoRevision: string, cacheText: string): string {
	const queryHash = buildQueryHash(input, cacheText, repoRevision);
	return `${EXACT_PREFIX}${queryHash}`;
}

function buildSummaryPacket(
	input: Phase101SummaryInput,
	repoRevision: string,
	cacheText: string,
	generation: Phase101SummaryGeneration,
	cache: 'exact' | 'semantic' | 'miss',
	exactCacheHit: boolean,
	semanticCacheHit: boolean,
	semanticEmbedding?: number[],
	hitCount = 0
): Phase101SummaryPacket {
	const queryHash = buildQueryHash(input, cacheText, repoRevision);
	const contentHash = buildContentHash(cacheText);
	const sourceRefs = uniqueStrings([...(input.sourceRefs ?? []), input.documentId]);
	const featureIds = uniqueStrings(input.featureIds ?? []);
	const laneIds = uniqueStrings(input.laneIds ?? []);
	const synthesis = generation.synthesis;
	return {
		packetId: buildPacketId(queryHash),
		queryHash,
		contentHash,
		repoRevision,
		model: (input.model ?? DEFAULT_MODEL).trim(),
		promptVersion: (input.promptVersion ?? DEFAULT_PROMPT_VERSION).trim(),
		intent: (input.intent ?? DEFAULT_INTENT).trim(),
		sourceRefs,
		featureIds,
		laneIds,
		summary: buildSummaryText(synthesis, generation.rawText),
		lod0Tags: buildLod0Tags(input, synthesis),
		lod1Summary: buildLod1Summary(synthesis),
		lod2Summary: buildLod2Summary(synthesis),
		recommendations: synthesis.nextSteps.slice(0, 12),
		risks: uniqueStrings([...synthesis.gaps, ...synthesis.contradictions]).slice(0, 12),
		retrieval: {
			exactCacheHit,
			semanticCacheHit,
			qdrantHits: [],
			turboVecHits: [],
		},
		synthesis,
		createdAt: new Date().toISOString(),
		hitCount,
	};
}

async function setSummaryPacketRecord(
	packet: Phase101SummaryPacket,
	cacheText: string,
	semanticEmbedding?: number[],
	redisClient: Redis = getRedis()
): Promise<void> {
	const redis = redisClient;
	const ttl = DEFAULT_TTL_SECONDS;
	const exactKey = `${EXACT_PREFIX}${packet.queryHash}`;
	const exactRecord = {
		packet,
		cacheText,
		queryHash: packet.queryHash,
		contentHash: packet.contentHash,
		cachedAt: packet.createdAt,
		hitCount: packet.hitCount,
	};

	const pipeline = redis.pipeline();
	pipeline.set(exactKey, JSON.stringify(exactRecord), 'EX', ttl);

	for (const sourceRef of packet.sourceRefs) {
		pipeline.set(sourceRefIndexKey(sourceRef), exactKey, 'EX', ttl);
	}

	for (const featureId of packet.featureIds) {
		const key = featureIndexKey(featureId);
		pipeline.lpush(key, packet.packetId);
		pipeline.ltrim(key, 0, 24);
		pipeline.expire(key, ttl);
	}

	if (semanticEmbedding && semanticEmbedding.length > 0) {
		const semanticKey = semanticIndexKey(packet.packetId);
		pipeline.set(
			semanticKey,
			JSON.stringify({
				...exactRecord,
				semanticEmbedding,
			}),
			'EX',
			ttl
		);
		pipeline.lpush(SEMANTIC_INDEX_KEY, semanticKey);
		pipeline.ltrim(SEMANTIC_INDEX_KEY, 0, SEMANTIC_SCAN_LIMIT - 1);
		pipeline.expire(SEMANTIC_INDEX_KEY, ttl);
	}

	await pipeline.exec();

	await storeSemanticCacheRecord(buildSemanticCacheRecord(packet)).catch(() => {});
}

export async function readPhase101SummaryPacketBySourceRef(
	sourceRef: string,
	redisClient: Redis = getRedis()
): Promise<Phase101SummaryPacket | null> {
	try {
		const redis = redisClient;
		const indexKey = sourceRefIndexKey(sourceRef);
		const exactKey = await redis.get(indexKey);
		if (!exactKey) return null;
		const raw = await redis.get(exactKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { packet?: Phase101SummaryPacket };
		return parsed.packet ?? null;
	} catch {
		return null;
	}
}

export async function readPhase101SummaryRecordBySourceRef(
	sourceRef: string,
	redisClient: Redis = getRedis()
): Promise<Phase101SummaryStoredRecord | null> {
	try {
		const redis = redisClient;
		const indexKey = sourceRefIndexKey(sourceRef);
		const exactKey = await redis.get(indexKey);
		if (!exactKey) return null;
		const raw = await redis.get(exactKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			packet?: Phase101SummaryPacket;
			cacheText?: string;
			queryHash?: string;
			contentHash?: string;
			hitCount?: number;
			cachedAt?: string;
		};
		if (!parsed.packet || typeof parsed.cacheText !== 'string') return null;
		return {
			packet: parsed.packet,
			cacheText: parsed.cacheText,
			exactCacheKey: exactKey,
			queryHash: parsed.queryHash ?? parsed.packet.queryHash,
			contentHash: parsed.contentHash ?? parsed.packet.contentHash,
			hitCount: Number(parsed.hitCount ?? parsed.packet.hitCount ?? 0),
			cachedAt: typeof parsed.cachedAt === 'string' ? parsed.cachedAt : parsed.packet.createdAt,
		};
	} catch {
		return null;
	}
}

async function getExactSummaryPacket(
	cacheKey: string,
	redisClient: Redis = getRedis()
): Promise<Phase101SummaryPacket | null> {
	try {
		const redis = redisClient;
		const raw = await redis.get(cacheKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { packet?: Phase101SummaryPacket };
		return parsed.packet ?? null;
	} catch {
		return null;
	}
}

async function searchSemanticSummaryPacket(
	cacheText: string,
	input: Phase101SummaryInput,
	repoRevision: string,
	queryEmbedding?: number[] | null,
	redisClient: Redis = getRedis()
): Promise<Phase101SummaryPacket | null> {
	try {
		const embedding =
			Array.isArray(queryEmbedding) && queryEmbedding.length > 0
				? queryEmbedding
				: await generateSingleEmbedding(cacheText).catch(() => null);
		if (!Array.isArray(embedding) || embedding.length === 0) return null;

		const redis = redisClient;
		const recentKeys = await redis.lrange(SEMANTIC_INDEX_KEY, 0, SEMANTIC_SCAN_LIMIT - 1);
		let bestPacket: Phase101SummaryPacket | null = null;
		let bestScore = 0;

		for (const key of recentKeys) {
			const raw = await redis.get(key);
			if (!raw) continue;
			const record = JSON.parse(raw) as { packet?: Phase101SummaryPacket; semanticEmbedding?: number[] };
			if (!record.packet || !Array.isArray(record.semanticEmbedding) || record.semanticEmbedding.length === 0) {
				continue;
			}

			const score = cosineSimilarity(embedding, record.semanticEmbedding);
			if (score >= SEMANTIC_THRESHOLD && score > bestScore) {
				bestScore = score;
				bestPacket = {
					...record.packet,
					retrieval: {
						...record.packet.retrieval,
						exactCacheHit: false,
						semanticCacheHit: true,
					},
					hitCount: (record.packet.hitCount ?? 0) + 1,
				};
			}
		}

		if (!bestPacket) return null;

		const exactKey = buildPhase101SummaryCacheKey(input, repoRevision, cacheText);
		await setSummaryPacketRecord(bestPacket, cacheText, embedding, redis).catch(() => {});
		try {
			await redis.set(
				exactKey,
				JSON.stringify({
					packet: bestPacket,
					cacheText,
					queryHash: bestPacket.queryHash,
					contentHash: bestPacket.contentHash,
					cachedAt: bestPacket.createdAt,
					hitCount: bestPacket.hitCount,
				}),
				'EX',
				DEFAULT_TTL_SECONDS
			);
		} catch {
			// ignore promotion failure
		}

		return bestPacket;
	} catch {
		return null;
	}
}

export async function runPhase101SummaryCache(
	input: Phase101SummaryInput,
	generator: Phase101SummaryGenerator,
	options?: { redisClient?: Redis }
): Promise<Phase101SummaryCacheResult> {
	const repoRevision = await resolveRepoRevision(input.repoRevision);
	const cacheText = buildPhase101SummaryCacheText(input);
	const redisClient = options?.redisClient ?? getRedis();
	const model = (input.model ?? DEFAULT_MODEL).trim();
	const promptVersion = (input.promptVersion ?? DEFAULT_PROMPT_VERSION).trim();
	const intent = (input.intent ?? DEFAULT_INTENT).trim();
	const normalizedInput: Phase101SummaryInput = {
		...input,
		sourceRefs: uniqueStrings([...(input.sourceRefs ?? []), input.documentId]),
		featureIds: uniqueStrings(input.featureIds ?? []),
		laneIds: uniqueStrings(input.laneIds ?? []),
		model,
		promptVersion,
		intent,
		repoRevision,
	};
	const exactCacheKey = buildPhase101SummaryCacheKey(normalizedInput, repoRevision, cacheText);

	const exactHit = await getExactSummaryPacket(exactCacheKey, redisClient);
	if (exactHit) {
		return {
			packet: {
				...exactHit,
				retrieval: {
					...exactHit.retrieval,
					exactCacheHit: true,
				},
				hitCount: (exactHit.hitCount ?? 0) + 1,
			},
			cache: 'exact',
			exactCacheKey,
		};
	}

	const semanticEmbedding =
		Array.isArray(input.semanticEmbedding) && input.semanticEmbedding.length > 0
			? input.semanticEmbedding
			: await generateSingleEmbedding(cacheText).catch(() => null);
	const semanticHit = await searchSemanticSummaryPacket(
		cacheText,
		normalizedInput,
		repoRevision,
		semanticEmbedding,
		redisClient
	);
	if (semanticHit) {
		return {
			packet: semanticHit,
			cache: 'semantic',
			exactCacheKey,
			semanticCacheKey: semanticIndexKey(semanticHit.packetId),
		};
	}

	const generation = await generator({
		cacheText,
		model,
		promptVersion,
		intent,
		repoRevision,
		sourceRefs: normalizedInput.sourceRefs ?? [normalizedInput.documentId],
		featureIds: normalizedInput.featureIds ?? [],
		exactCacheKey,
		queryHash: buildQueryHash(normalizedInput, cacheText, repoRevision),
		contentHash: buildContentHash(cacheText),
		semanticEmbedding: semanticEmbedding ?? undefined,
	});

	const packet = buildSummaryPacket(
		normalizedInput,
		repoRevision,
		cacheText,
		generation,
		'miss',
		false,
		false,
		semanticEmbedding ?? undefined,
		0
	);

	await setSummaryPacketRecord(packet, cacheText, semanticEmbedding ?? undefined, redisClient);

	return {
		packet,
		cache: 'miss',
		exactCacheKey,
		semanticCacheKey: semanticEmbedding ? semanticIndexKey(packet.packetId) : undefined,
	};
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
