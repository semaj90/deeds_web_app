/**
 * image-search.ts
 *
 * Evidence image search service.
 *
 * Pipeline:
 *   1. VLM caption  — analyzeVLMEvidence() → summary + suggestedTags
 *   2. Embed        — embeddinggemma (768d) via /api/embed or direct Ollama
 *   3. Qdrant ANN   — evidence_items collection, content vector
 *   4. Tag boost    — results with matching VLM tags get +0.15 score bonus
 *   5. Rerank       — Karpathy-style blend: 0.7·vector + 0.15·tag + 0.15·karpathy
 *
 * Trust tier: T3 (committed evidence, ×0.95) — bumped to T2 if user_approved tag present.
 */

import { createHash } from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';
import { analyzeEvidenceImage } from '$lib/server/analysis/vlm-evidence-analyzer.js';
import { QdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { getRedis } from '$lib/server/redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageSearchOpts {
	/** Raw image buffer (JPEG / PNG / WebP) */
	buffer: Buffer;
	fileName: string;
	/** Collection to search; defaults to 'evidence_items' */
	collection?: string;
	/** Max results to return */
	limit?: number;
	/** Minimum Qdrant score threshold before boosts */
	scoreThreshold?: number;
	/** Optional case filter */
	caseId?: string;
	/** Include rejected points from prior feedback */
	includeRejected?: boolean;
	/** Override the VLM prompt for specialised searches */
	promptOverride?: string;
}

export interface ImageSearchHit {
	id: string | number;
	score: number;
	rawScore: number;
	tagBoost: number;
	payload: Record<string, unknown>;
	caption: string;
	matchedTags: string[];
}

export interface ImageSearchResult {
	hits: ImageSearchHit[];
	caption: string;
	suggestedTags: string[];
	model: string;
	cached: boolean;
	durationMs: number;
	collection: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBED_TIMEOUT     = 12_000;
const QDRANT_TIMEOUT    = 8_000;
const TAG_BOOST         = 0.15;
const CACHE_TTL_S       = 300; // 5 min Redis cache on caption+embedding per SHA-256
const RERANK_CACHE_TTL  = 300; // 5 min Redis cache for GPU rerank results

// ── Helpers ───────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
	const ollama = ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
	const res = await fetch(`${ollama}/api/embeddings`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ model: 'embeddinggemma:latest', prompt: text.slice(0, 4096) }),
		signal:  AbortSignal.timeout(EMBED_TIMEOUT),
	});
	if (!res.ok) throw new Error(`Ollama embed: ${res.status}`);
	const { embedding } = await res.json() as { embedding: number[] };
	return embedding;
}

function rerankCacheKey(caption: string, collection: string, caseId?: string): string {
	const key = `${collection}:${caseId ?? ''}:${caption.slice(0, 256)}`;
	return `ace:img:rerank:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

function tagOverlap(vlmTags: string[], payloadTags: unknown): number {
	if (!Array.isArray(payloadTags) || payloadTags.length === 0) return 0;
	const lower = vlmTags.map(t => t.toLowerCase());
	const hits  = (payloadTags as string[]).filter(t => lower.includes(String(t).toLowerCase()));
	return hits.length / Math.max(vlmTags.length, 1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function searchByImage(opts: ImageSearchOpts): Promise<ImageSearchResult> {
	const t0         = Date.now();
	const collection = opts.collection      ?? 'evidence_items';
	const limit      = Math.min(opts.limit ?? 10, 10); // cap at 10 to prevent GPU rerank bottleneck
	const threshold  = opts.scoreThreshold  ?? 0.20;

	// ── Step 1: VLM caption (cached by SHA-256 of buffer) ────────────────────
	let redis: ReturnType<typeof getRedis> | null = null;
	let cacheKey = '';
	let cachedCaption: { summary: string; tags: string[]; model: string } | null = null;

	try {
		redis = getRedis();
		const { createHash } = await import('node:crypto');
		cacheKey = `img:search:caption:${createHash('sha256').update(opts.buffer).digest('hex').slice(0, 16)}`;
		const raw = await redis.get(cacheKey);
		if (raw) cachedCaption = JSON.parse(raw);
	} catch { /* non-fatal */ }

	let caption      = cachedCaption?.summary ?? '';
	let suggestedTags = cachedCaption?.tags   ?? [];
	let vlmModel     = cachedCaption?.model   ?? 'cached';
	let vlmCached    = !!cachedCaption;

	if (!cachedCaption) {
		const vlmResult = await analyzeEvidenceImage({
			buffer:          opts.buffer,
			fileName:        opts.fileName,
			promptOverride:  opts.promptOverride,
		});
		caption       = vlmResult.summary;
		suggestedTags = vlmResult.suggestedTags;
		vlmModel      = vlmResult.model;
		vlmCached     = vlmResult.cached;

		// Cache caption for repeat queries on the same image
		if (redis && cacheKey) {
			redis.setex(cacheKey, CACHE_TTL_S, JSON.stringify({
				summary: caption,
				tags:    suggestedTags,
				model:   vlmModel,
			})).catch(() => {});
		}
	}

	// ── Step 2: Embed caption ─────────────────────────────────────────────────
	const vector = await embedText(caption);

	// ── Step 3: Qdrant ANN search ─────────────────────────────────────────────
	const qdrant   = new QdrantManager();
	const mustFilter: Record<string, unknown>[] = [];
	const mustNotFilter: Record<string, unknown>[] = [];

	if (opts.caseId) {
		mustFilter.push({ key: 'caseId', match: { value: opts.caseId } });
	}
	if (!opts.includeRejected) {
		mustNotFilter.push({ key: 'user_rejected', match: { value: true } });
	}

	const filter = (mustFilter.length || mustNotFilter.length)
		? {
			must:     mustFilter.length     ? mustFilter     : undefined,
			must_not: mustNotFilter.length  ? mustNotFilter  : undefined,
		}
		: undefined;

	// Try named vector first (evidence_items uses 'content'), fall back to unnamed
	let qdrantHits: Array<{ id: string | number; score: number; payload: Record<string, unknown> }> = [];
	try {
		const res = await qdrant.client.search(collection, {
			vector:         { name: 'content', vector } as Parameters<typeof qdrant.client.search>[1]['vector'],
			limit:          limit * 2, // over-fetch for tag reranking
			score_threshold: threshold,
			with_payload:   true,
			...(filter ? { filter } : {}),
		} as Parameters<typeof qdrant.client.search>[1]);
		qdrantHits = res as typeof qdrantHits;
	} catch {
		// Fallback: unnamed vector (older collections)
		const res = await qdrant.client.search(collection, {
			vector:         vector as Parameters<typeof qdrant.client.search>[1]['vector'],
			limit:          limit * 2,
			score_threshold: threshold,
			with_payload:   true,
			...(filter ? { filter } : {}),
		} as Parameters<typeof qdrant.client.search>[1]);
		qdrantHits = res as typeof qdrantHits;
	}

	// ── Step 3.5: Redis rerank cache — skip GPU work on repeated queries ────────
	let rerankCached = false;
	const rKey = rerankCacheKey(caption, collection, opts.caseId);
	if (redis) {
		try {
			const raw = await redis.get(rKey);
			if (raw) {
				const cached = JSON.parse(raw) as ImageSearchHit[];
				return {
					hits:         cached,
					caption,
					suggestedTags,
					model:        vlmModel,
					cached:       true,
					durationMs:   Date.now() - t0,
					collection,
				};
			}
		} catch { /* non-fatal */ }
	}

	// ── Step 4: Tag boost + rerank ────────────────────────────────────────────
	const boosted: ImageSearchHit[] = qdrantHits.map(hit => {
		const overlap  = tagOverlap(suggestedTags, hit.payload?.tags);
		const tagBoost = overlap * TAG_BOOST;
		const rawScore = hit.score;
		const score    = Math.min(1.0, rawScore + tagBoost);
		const matched  = suggestedTags.filter(t =>
			(hit.payload?.tags as string[] ?? []).map(x => x.toLowerCase()).includes(t.toLowerCase())
		);
		return {
			id:          hit.id,
			score,
			rawScore,
			tagBoost,
			payload:     hit.payload ?? {},
			caption,
			matchedTags: matched,
		};
	});

	boosted.sort((a, b) => b.score - a.score);
	const hits = boosted.slice(0, limit);

	// Write rerank results to Redis cache (fire-and-forget)
	if (redis && !rerankCached) {
		redis.setex(rKey, RERANK_CACHE_TTL, JSON.stringify(hits)).catch(() => {});
	}

	return {
		hits,
		caption,
		suggestedTags,
		model:        vlmModel,
		cached:       vlmCached,
		durationMs:   Date.now() - t0,
		collection,
	};
}
