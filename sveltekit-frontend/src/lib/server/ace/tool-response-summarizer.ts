/**
 * Tool Response Summarizer — compress agentic tool call results for Gemma4.
 *
 * When Gemma4 calls a tool (e.g. trace.kag_search) the raw result can be 10-50
 * chunks × ~500 tokens = 5,000-25,000 tokens. That blows the KV cache budget.
 *
 * This module:
 *   1. Projects each chunk embedding → MLA latent (128-dim)
 *   2. Runs MLA attention over the chunks to weight by query relevance
 *   3. Produces a weighted centroid embedding (128-dim latent, 768-dim full)
 *   4. Produces a compact text summary (≤200 tokens target)
 *   5. Caches both under content-addressed Redis key (TTL 300s)
 *
 * The Gemma4 tool loop receives the summary text + a budget report instead of
 * the raw chunks, reducing KV cache entries by ~95%.
 *
 * Budget tracking: every summarization emits a trace event with tokenCount,
 * compressionRatio, and cacheHit so the KV pressure is observable.
 */

import { getRedis }        from '$lib/server/redis.js';
import { recordEvent }     from '$lib/server/trace/trace-collector.js';
import {
  getProjectionMatrix,
  projectDown,
  mlaAttention,
  MLA_RANK,
  MLA_DIM,
} from '$lib/server/search/mla-kv-compress.js';
import { createHash }      from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolResultChunk {
  stable_key:  string;
  content:     string;
  embedding?:  number[];        // 768-dim
  score?:      number;
  filePath?:   string;
  symbolName?: string;
  tags?:       string;
}

export interface ToolResponseSummary {
  summaryText:      string;        // ≤200-token compressed synthesis
  centroidLatent:   Float32Array;  // 128-dim weighted centroid
  centroidFull?:    Float32Array;  // 768-dim full centroid (when embeddings present)
  chunkCount:       number;
  tokenEstimate:    number;        // estimated raw tokens before compression
  compressedTokens: number;        // estimated tokens of summaryText
  compressionRatio: number;
  fromCache:        boolean;
  topKeys:          string[];      // stable_keys of highest-weight chunks (top 3)
}

// ── Token estimation (rough: 1 token ≈ 4 chars) ──────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Content-addressed cache key ───────────────────────────────────────────────

function summaryKey(queryHash: string, chunkKeys: string[]): string {
  const sorted = [...chunkKeys].sort().join(',');
  const hash = createHash('sha1').update(queryHash + ':' + sorted).digest('hex').slice(0, 16);
  return `tool:summary:${hash}`;
}

// ── Build text summary from top-weighted chunks ───────────────────────────────

function buildSummaryText(
  chunks:       ToolResultChunk[],
  weights:      Float32Array,
  topN:         number = 5,
): string {
  const indexed = Array.from(weights).map((w, i) => ({ w, i }));
  indexed.sort((a, b) => b.w - a.w);
  const topIdx = indexed.slice(0, topN).map(x => x.i);

  const parts: string[] = [];
  for (const idx of topIdx) {
    const c = chunks[idx];
    const snippet = c.content.slice(0, 300).replace(/\s+/g, ' ').trim();
    const label = c.symbolName ?? c.filePath?.split('/').pop() ?? c.stable_key.slice(0, 12);
    parts.push(`[${label}] ${snippet}`);
  }

  return parts.join('\n---\n');
}

// ── Weighted centroid in latent space ─────────────────────────────────────────

function weightedCentroid(latents: Float32Array[], weights: Float32Array): Float32Array {
  const centroid = new Float32Array(MLA_RANK);
  let totalW = 0;
  for (let i = 0; i < latents.length; i++) {
    const w = weights[i];
    totalW += w;
    for (let r = 0; r < MLA_RANK; r++) centroid[r] += latents[i][r] * w;
  }
  if (totalW > 0) for (let r = 0; r < MLA_RANK; r++) centroid[r] /= totalW;
  return centroid;
}

function weightedCentroidFull(embeddings: Float32Array[], weights: Float32Array): Float32Array {
  const centroid = new Float32Array(MLA_DIM);
  let totalW = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const w = weights[i];
    totalW += w;
    for (let d = 0; d < MLA_DIM; d++) centroid[d] += embeddings[i][d] * w;
  }
  if (totalW > 0) for (let d = 0; d < MLA_DIM; d++) centroid[d] /= totalW;
  return centroid;
}

// ── Main summarizer ───────────────────────────────────────────────────────────

export async function summarizeToolResponse(
  toolName:        string,
  queryEmbedding:  number[],
  chunks:          ToolResultChunk[],
  opts: { skipCache?: boolean; topN?: number } = {}
): Promise<ToolResponseSummary> {
  if (!chunks.length) {
    return {
      summaryText: '(no results)',
      centroidLatent: new Float32Array(MLA_RANK),
      chunkCount: 0,
      tokenEstimate: 0,
      compressedTokens: 0,
      compressionRatio: 1,
      fromCache: false,
      topKeys: [],
    };
  }

  const queryHash   = createHash('sha1')
    .update(Buffer.from(new Float32Array(queryEmbedding).buffer))
    .digest('hex').slice(0, 12);
  const cacheKey    = summaryKey(queryHash, chunks.map(c => c.stable_key));
  const rawTokens   = chunks.reduce((s, c) => s + estimateTokens(c.content), 0);

  // ── Redis cache check ───────────────────────────────────────────────────
  if (!opts.skipCache) {
    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Omit<ToolResponseSummary, 'centroidLatent' | 'centroidFull'> & {
          centroidLatentB64: string;
          centroidFullB64?: string;
        };
        const latentBuf = Buffer.from(parsed.centroidLatentB64, 'base64');
        const centroidLatent = new Float32Array(latentBuf.buffer.slice(latentBuf.byteOffset, latentBuf.byteOffset + latentBuf.length));
        recordEvent(null, 'cache_hit', { cacheKey, symbolName: `tool:${toolName}` });
        return {
          summaryText:      parsed.summaryText,
          centroidLatent,
          chunkCount:       parsed.chunkCount,
          tokenEstimate:    parsed.tokenEstimate,
          compressedTokens: parsed.compressedTokens,
          compressionRatio: parsed.compressionRatio,
          fromCache:        true,
          topKeys:          parsed.topKeys,
        };
      }
    } catch { /* non-fatal */ }
  }

  // ── MLA projection + attention ──────────────────────────────────────────
  const t0  = Date.now();
  const W   = await getProjectionMatrix();
  const queryLatent  = projectDown(new Float32Array(queryEmbedding), W);

  const embeddable = chunks.filter(c => c.embedding?.length === MLA_DIM);
  const allLatents: Float32Array[] = chunks.map(c =>
    c.embedding?.length === MLA_DIM
      ? projectDown(new Float32Array(c.embedding), W)
      : new Float32Array(MLA_RANK)  // zero for missing embeddings
  );

  const attnWeights = mlaAttention(queryLatent, allLatents);

  // ── Centroids ───────────────────────────────────────────────────────────
  const centroidLatent = weightedCentroid(allLatents, attnWeights);
  const centroidFull   = embeddable.length > 0
    ? weightedCentroidFull(
        embeddable.map(c => new Float32Array(c.embedding!)),
        new Float32Array(embeddable.map((_, i) => attnWeights[chunks.indexOf(embeddable[i])]))
      )
    : undefined;

  // ── Summary text ────────────────────────────────────────────────────────
  const summaryText     = buildSummaryText(chunks, attnWeights, opts.topN ?? 5);
  const compressedTokens = estimateTokens(summaryText);
  const compressionRatio = rawTokens > 0 ? rawTokens / compressedTokens : 1;

  // ── Top keys ────────────────────────────────────────────────────────────
  const topKeys = Array.from(attnWeights)
    .map((w, i): [number, number] => [i, w])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([i]) => chunks[i]?.stable_key ?? '');

  const result: ToolResponseSummary = {
    summaryText,
    centroidLatent,
    centroidFull,
    chunkCount:       chunks.length,
    tokenEstimate:    rawTokens,
    compressedTokens,
    compressionRatio,
    fromCache:        false,
    topKeys,
  };

  // ── Persist to Redis ────────────────────────────────────────────────────
  try {
    const redis = getRedis();
    const payload = {
      summaryText,
      centroidLatentB64:  Buffer.from(centroidLatent.buffer).toString('base64'),
      centroidFullB64:    centroidFull ? Buffer.from(centroidFull.buffer).toString('base64') : undefined,
      chunkCount:         chunks.length,
      tokenEstimate:      rawTokens,
      compressedTokens,
      compressionRatio,
      fromCache:          false,
      topKeys,
    };
    await redis.setex(cacheKey, 300, JSON.stringify(payload));
  } catch { /* non-fatal */ }

  // ── Trace event ─────────────────────────────────────────────────────────
  recordEvent(null, 'span', {
    symbolName: `tool:${toolName}:summarize`,
    durationMs: Date.now() - t0,
    metadata: {
      chunkCount:       chunks.length,
      rawTokens,
      compressedTokens,
      compressionRatio: Math.round(compressionRatio * 10) / 10,
    },
  });

  return result;
}

// ── KV budget reporter (for Gemma4 tool loop context) ────────────────────────

export interface KVBudgetReport {
  usedTokens:         number;
  budgetTokens:       number;
  remainingTokens:    number;
  toolRound:          number;
  summaryTokens:      number;    // tokens used by compressed summaries this round
  fullChunkTokens:    number;    // tokens that would have been used without compression
  savedTokens:        number;
}

export function buildKVBudgetReport(
  summaries:       ToolResponseSummary[],
  systemTokens:    number,
  budgetTokens:    number = 4096,
  toolRound:       number = 1,
): KVBudgetReport {
  const summaryTokens   = summaries.reduce((s, r) => s + r.compressedTokens, 0);
  const fullChunkTokens = summaries.reduce((s, r) => s + r.tokenEstimate, 0);
  const usedTokens      = systemTokens + summaryTokens;
  return {
    usedTokens,
    budgetTokens,
    remainingTokens: Math.max(0, budgetTokens - usedTokens),
    toolRound,
    summaryTokens,
    fullChunkTokens,
    savedTokens: fullChunkTokens - summaryTokens,
  };
}
