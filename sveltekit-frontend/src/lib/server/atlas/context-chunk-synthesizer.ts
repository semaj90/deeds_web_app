/**
 * context-chunk-synthesizer.ts
 *
 * Server-side service that orchestrates token boundaries and consolidates
 * text chunks to generate action-oriented feature group summaries via Gemma 4.
 *
 * Features:
 *   - Groups incoming Atlas chunks by feature key.
 *   - Resolves appropriate prompt templates with token boundary budgets.
 *   - Probes TurboQuant vs Ollama cascade paths synchronously.
 *   - Caches completed CtxPackets back into Redis ace:ctx:{featureKey} (24h TTL).
 *
 * This service runs SERVER-SIDE ONLY.
 */

import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import type { AtlasChunk, CtxPacket } from './feature-context-matrix.js';

// ── Constants & Prompts ────────────────────────────────────────────────────────

const ACE_CTX_PREFIX = 'ace:ctx';
const REDIS_TTL = 86400; // 24 hours

const SYSTEM_PROMPT = `You are a code analysis assistant. Given code/doc/error chunks about a software feature,
produce a structured 4-part summary:
1. Feature description (1 sentence)
2. Errors/issues present (bullet list, or "None found")
3. Involved files (list, or "Unknown")
4. Recommended next action (1-2 sentences)
Be concise. Do not include raw code blocks. Do not repeat the chunks verbatim.`;

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Normalizes tags and paths to extract a coherent feature key.
 */
export function deriveFeatureKey(tags: string[] = [], sourcePath?: string | null): string {
  const featureTags = tags.filter(t => t.startsWith('feature:')).map(t => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  if (sourcePath) {
    const filename = sourcePath.split('/').pop() ?? 'unknown';
    return filename.replace(/\.[^.]+$/, '');
  }
  return 'unknown';
}

/**
 * Groups raw text chunks by their derived feature key.
 */
export function groupByFeature(chunks: AtlasChunk[]): Map<string, AtlasChunk[]> {
  const groups = new Map<string, AtlasChunk[]>();
  for (const chunk of chunks) {
    const key = deriveFeatureKey(chunk.tags, chunk.source_path);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(chunk);
  }
  return groups;
}

/**
 * Checks if the high-performance TurboQuant service is responsive.
 */
async function checkTurboQuant(): Promise<boolean> {
  const url = `${ENV.TURBOQUANT_URL}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Builds a dense representation of chunks for LLM token ingestion.
 */
function buildUserPrompt(featureKey: string, chunks: AtlasChunk[]): string {
  const snippets = chunks
    .slice(0, 5)
    .map((c, i) => `--- Chunk ${i + 1} (${c.source_type}, words=${c.word_count}) ---\n${c.text.slice(0, 600)}`)
    .join('\n\n');

  const filePaths = Array.from(
    new Set(chunks.flatMap(c => [...(c.file_refs ?? []), ...(c.rg_paths ?? [])]))
  ).slice(0, 10);

  const tags = Array.from(new Set(chunks.flatMap(c => c.tags ?? [])));

  return `Feature key: ${featureKey}
Tags: ${tags.join(', ')}
Related files: ${filePaths.join(', ') || 'Unknown'}
Chunks (${chunks.length} total, showing first 5):

${snippets}

Summarize this feature.`;
}

// ── Public Service API ────────────────────────────────────────────────────────

/**
 * Consolidates and synthesizes a set of feature chunks using the local inference cascade.
 * Saves outcome to Redis under ace:ctx:{featureKey}.
 */
export async function synthesizeFeatureChunks(
  featureKey: string,
  chunks: AtlasChunk[],
  options: { force?: boolean } = {}
): Promise<CtxPacket | null> {
  if (!chunks.length) return null;

  const redis = getRedis();
  const cacheKey = `${ACE_CTX_PREFIX}:${featureKey}`;

  // Check Redis cache first unless force=true
  if (!options.force) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as CtxPacket;
      }
    } catch (err) {
      console.warn(`[synthesizer] Cache read error for ${featureKey}:`, err);
    }
  }

  // Determine endpoint availability
  const isTurboActive = await checkTurboQuant();
  const endpointUrl = isTurboActive
    ? `${ENV.TURBOQUANT_URL}/v1/chat/completions`
    : `${ENV.OLLAMA_BASE_URL}/v1/chat/completions`;

  const modelName = isTurboActive ? ENV.GEMMA4_MODEL : ENV.OLLAMA_CHAT_MODEL;

  const systemPrompt = SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(featureKey, chunks);

  let synthesis = '';
  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 400,
        temperature: 0.2,
        stream: false
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      throw new Error(`Inference engine HTTP ${res.status}`);
    }

    const data = await res.json();
    synthesis = data.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (err: any) {
    console.error(`[synthesizer] LLM synthesis failed for key ${featureKey}:`, err.message);
    synthesis = `[synthesis unavailable: ${err.message}]`;
  }

  // Construct final durable context packet
  const allTags = Array.from(new Set(chunks.flatMap(c => c.tags ?? [])));
  const chunkIds = chunks.map(c => c.chunk_id);

  const packet: CtxPacket = {
    feature_key: featureKey,
    synthesis,
    chunk_ids: chunkIds,
    tags: allTags,
    indexed_at: new Date().toISOString()
  };

  // Cache back to Redis
  try {
    await redis.setex(cacheKey, REDIS_TTL, JSON.stringify(packet));
  } catch (err) {
    console.error(`[synthesizer] Redis caching failed for key ${featureKey}:`, err);
  }

  return packet;
}
