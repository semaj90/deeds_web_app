/**
 * PHASE 85a: SEMANTIC DIFF GATE
 *
 * Compare old vs new summaries via embedding similarity.
 * Gate regeneration based on semantic distance:
 *
 *   0.99+ → skip (identical meaning)
 *   0.95-0.99 → update metadata only (minor wording change)
 *   0.80-0.95 → regenerate summary (semantic shift)
 *   0.60-0.80 → GAN review required (significant change)
 *   <0.60 → full regeneration + GAN validation (semantic divergence)
 *
 * Storage: atlas_semantic_diffs table (recommendation + action_taken)
 */

import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { db } from '$lib/server/db/client.js';
import { atlas_semantic_diffs } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SEMANTIC_DIFF_THRESHOLDS = {
  skip: 0.99,           // 99%+ similarity → skip regeneration
  metadata_only: 0.95,  // 95-99% similarity → update metadata only
  regenerate: 0.80,     // 80-95% similarity → regenerate summary
  gan_review: 0.60,     // 60-80% similarity → GAN review required
} as const;

export type SemanticDiffRecommendation = 'skip' | 'metadata_only' | 'regenerate' | 'gan_review' | 'full_regeneration';

interface SemanticDiffResult {
  recommendation: SemanticDiffRecommendation;
  similarity: number;
  costSaved?: number;
  rationale: string;
}

// ── Embed text via EmbeddingGemma ─────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await ollamaFetch('/v1/embeddings', {
      method: 'POST',
      body: {
        model: 'embeddinggemma:latest',
        input: text,
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Cosine Similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;

  return Math.max(-1, Math.min(1, dotProduct / magnitude));
}

// ── Main Semantic Diff Gate ───────────────────────────────────────────────────

export async function semanticDiffGate(
  packetKey: string,
  sourceRef: string,
  oldSummary: string,
  newSummary: string,
  traceId?: string
): Promise<SemanticDiffResult> {
  // Identical text → skip
  if (oldSummary === newSummary) {
    return {
      recommendation: 'skip',
      similarity: 1.0,
      costSaved: 100,
      rationale: 'Summaries identical (text match)',
    };
  }

  // Embed both
  const [oldEmb, newEmb] = await Promise.all([
    embedText(oldSummary),
    embedText(newSummary),
  ]);

  if (!oldEmb || !newEmb) {
    // Fallback to text comparison if embedding fails
    const textSim = computeTextSimilarity(oldSummary, newSummary);
    const recommendation = textSim > 0.85 ? 'metadata_only' : 'regenerate';
    return {
      recommendation,
      similarity: textSim,
      rationale: 'Embedding service unavailable; using text similarity fallback',
    };
  }

  // Cosine similarity
  const similarity = cosineSimilarity(oldEmb, newEmb);

  // Gate decision
  let recommendation: SemanticDiffRecommendation;
  let costSaved: number | undefined;

  if (similarity >= SEMANTIC_DIFF_THRESHOLDS.skip) {
    recommendation = 'skip';
    costSaved = 100; // 100% cost saved
  } else if (similarity >= SEMANTIC_DIFF_THRESHOLDS.metadata_only) {
    recommendation = 'metadata_only';
    costSaved = 80; // Skip summary regen, just update metadata
  } else if (similarity >= SEMANTIC_DIFF_THRESHOLDS.regenerate) {
    recommendation = 'regenerate';
    costSaved = 0; // Must regenerate
  } else if (similarity >= SEMANTIC_DIFF_THRESHOLDS.gan_review) {
    recommendation = 'gan_review';
    costSaved = 0; // Must regenerate + GAN validation
  } else {
    recommendation = 'full_regeneration';
    costSaved = 0; // Full regen + GAN validation required
  }

  // Log to atlas_semantic_diffs
  try {
    await db.insert(atlas_semantic_diffs).values({
      packet_key: packetKey,
      source_ref: sourceRef,
      similarity: similarity,
      recommendation: recommendation,
      trace_id: traceId,
      created_at: new Date(),
    });
  } catch (err) {
    // Log but don't fail
    console.error('Failed to log semantic diff:', err);
  }

  return {
    recommendation,
    similarity,
    costSaved,
    rationale: `Semantic similarity: ${(similarity * 100).toFixed(1)}% → ${recommendation}`,
  };
}

// ── Text Similarity Fallback (Levenshtein-based) ───────────────────────────────

function computeTextSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1: string, s2: string): number {
  const costs: number[] = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
}

// ── Cache summary embeddings in Redis for reuse ───────────────────────────────

export async function cacheSummaryEmbedding(
  summaryHash: string,
  embedding: number[]
): Promise<void> {
  const redis = getRedis();
  const key = `semantic:embedding:${summaryHash}`;
  const ttl = 86400 * 7; // 7 days

  try {
    await redis.setex(key, ttl, JSON.stringify(embedding));
  } catch (err) {
    console.error('Failed to cache summary embedding:', err);
  }
}

export async function getCachedSummaryEmbedding(summaryHash: string): Promise<number[] | null> {
  const redis = getRedis();
  const key = `semantic:embedding:${summaryHash}`;

  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    return null;
  }
}
