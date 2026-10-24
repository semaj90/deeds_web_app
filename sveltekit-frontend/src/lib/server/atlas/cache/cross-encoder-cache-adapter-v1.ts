import { z } from 'zod';
import {
	buildCrossEncoderCacheKeyV1,
	canReuseCrossEncoderScoreV1,
	type CrossEncoderCacheKeyV1Input,
	type CrossEncoderScoreReceiptV1,
} from './cross-encoder-cache-key.js';

export const CROSS_ENCODER_CACHE_ENTRY_SCHEMA_V1 = 'atlas.cross-encoder-cache-entry.v1' as const;

export const CrossEncoderCacheEntryV1Schema = z
	.object({
		schema: z.literal(CROSS_ENCODER_CACHE_ENTRY_SCHEMA_V1),
		cacheKey: z.string().regex(/^atlas:cross-encoder:v1:[a-f0-9]{64}$/),
		receipt: z
			.object({
				cacheKey: z.string().min(1),
				score: z.number().finite(),
				modelRevision: z.string().min(1),
				candidateContentHash: z.string().min(1),
				queryHash: z.string().min(1),
				status: z.enum(['proven', 'failed']),
			})
			.strict(),
		residency: z.enum(['HOT_VALKEY', 'WARM_LOCAL']),
		ttlSeconds: z.number().int().positive().max(604800), // Max 7 days
		createdAt: z.string().datetime(),
		expiresAt: z.string().datetime(),
	})
	.strict();

export type CrossEncoderCacheEntryV1 = z.infer<typeof CrossEncoderCacheEntryV1Schema>;

export interface CacheTelemetryCounterV1 {
	hits: number;
	misses: number;
	invalidated: number;
}

export function createCacheTelemetryCounterV1(): CacheTelemetryCounterV1 {
	return { hits: 0, misses: 0, invalidated: 0 };
}

export interface BuildCrossEncoderCacheEntryInput {
	receipt: CrossEncoderScoreReceiptV1;
	ttlSeconds?: number;
	residency?: 'HOT_VALKEY' | 'WARM_LOCAL';
	now?: Date;
}

export function buildCrossEncoderCacheEntryV1(
	input: BuildCrossEncoderCacheEntryInput,
): CrossEncoderCacheEntryV1 {
	const now = input.now ?? new Date();
	const ttlSeconds = input.ttlSeconds ?? 86400; // 24 hours default
	const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

	return CrossEncoderCacheEntryV1Schema.parse({
		schema: CROSS_ENCODER_CACHE_ENTRY_SCHEMA_V1,
		cacheKey: input.receipt.cacheKey,
		receipt: input.receipt,
		residency: input.residency ?? 'HOT_VALKEY',
		ttlSeconds,
		createdAt: now.toISOString(),
		expiresAt,
	});
}

export function serializeCrossEncoderCacheEntryV1(entry: CrossEncoderCacheEntryV1): string {
	const parsed = CrossEncoderCacheEntryV1Schema.parse(entry);
	return JSON.stringify(parsed);
}

export function parseCrossEncoderCacheEntryV1(raw: string): CrossEncoderCacheEntryV1 {
	try {
		const json = JSON.parse(raw);
		return CrossEncoderCacheEntryV1Schema.parse(json);
	} catch (err) {
		throw new Error(
			`CROSS_ENCODER_CACHE_ENTRY_PARSE_ERROR: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

export type CacheResolutionResultV1 =
	| { hit: true; score: number; receipt: CrossEncoderScoreReceiptV1 }
	| { hit: false; reason: 'MISS' | 'EXPIRED' | 'INVALIDATED' };

export function resolveCrossEncoderCacheScoreV1(
	keyInput: CrossEncoderCacheKeyV1Input,
	cachedRawOrEntry: string | CrossEncoderCacheEntryV1 | null | undefined,
	telemetry?: CacheTelemetryCounterV1,
	now: Date = new Date(),
): CacheResolutionResultV1 {
	if (!cachedRawOrEntry) {
		if (telemetry) telemetry.misses += 1;
		return { hit: false, reason: 'MISS' };
	}

	let entry: CrossEncoderCacheEntryV1;
	try {
		entry =
			typeof cachedRawOrEntry === 'string'
				? parseCrossEncoderCacheEntryV1(cachedRawOrEntry)
				: CrossEncoderCacheEntryV1Schema.parse(cachedRawOrEntry);
	} catch {
		if (telemetry) telemetry.invalidated += 1;
		return { hit: false, reason: 'INVALIDATED' };
	}

	// 1. Expiry check
	const expiresTime = new Date(entry.expiresAt).getTime();
	if (expiresTime <= now.getTime()) {
		if (telemetry) telemetry.invalidated += 1;
		return { hit: false, reason: 'EXPIRED' };
	}

	// 2. Strict provenance & receipt validation
	const isValid = canReuseCrossEncoderScoreV1(keyInput, entry.receipt);
	if (!isValid) {
		if (telemetry) telemetry.invalidated += 1;
		return { hit: false, reason: 'INVALIDATED' };
	}

	if (telemetry) telemetry.hits += 1;
	return {
		hit: true,
		score: entry.receipt.score,
		receipt: entry.receipt,
	};
}

export interface DailyTelemetryReceiptV1 {
	schema: 'atlas.daily-cache-telemetry.v1';
	date: string;
	counter: CacheTelemetryCounterV1;
	hitRate: number;
}

export function buildDailyTelemetryReceiptV1(
	counter: CacheTelemetryCounterV1,
	date: string = new Date().toISOString().slice(0, 10),
): DailyTelemetryReceiptV1 {
	const total = counter.hits + counter.misses + counter.invalidated;
	const hitRate = total > 0 ? counter.hits / total : 0;

	return {
		schema: 'atlas.daily-cache-telemetry.v1',
		date,
		counter: { ...counter },
		hitRate,
	};
}
