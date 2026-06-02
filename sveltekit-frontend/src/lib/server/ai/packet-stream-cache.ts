/**
 * packet-stream-cache.ts
 *
 * Resolves a retrieval packet from Redis/Valkey BEFORE tokens are spent on
 * llama-server / Gemma4. The resolved packet is injected into the system
 * prompt so the model has full context, then streamText() proceeds.
 *
 * Three-tier resolution:
 *   T1 — Redis exact packet  (ace:retrieval:packet:{queryHash})
 *   T2 — Redis semantic tuple (ace:packet:{queryHash}:tuple)
 *   T3 — Fresh ACE retrieval build (Qdrant + graph neighbor expansion)
 *
 * Write-back is handled by writeStreamResultToMemory(), called from
 * onStepFinish / onFinish inside the streaming route.
 *
 * Key layout (all with 300 s TTL unless noted):
 *   ace:retrieval:packet:{queryHash}   — JSON-serialised RetrievalPacket (5 min)
 *   ace:packet:{queryHash}:tuple       — JSON-serialised provenance tuple  (5 min)
 *   ace:stream:result:{queryHash}      — assembled full text after streaming (1 hr)
 */

import crypto from 'node:crypto';
import { getRedis } from '../redis.js';
import { generateEmbeddings } from '../grpc/embedding-client.js';
import { searchQdrantCode } from '../search/qdrant-search.js';
import { retrieveRankedEntities } from '../kb/search-logic-blended.js';

// TTLs (seconds)
const PACKET_TTL = 300;       // 5 min — retrieval packet
const RESULT_TTL = 3600;      // 1 hr  — assembled stream text

// Max chars of context injected into the system prompt
const MAX_PACKET_CONTEXT_CHARS = 6000;

export interface RetrievalChunk {
  stableKey: string;
  path: string;
  score: number;
  summary: string;
  labels?: string[];
}

export interface RetrievalPacket {
  queryHash: string;
  query: string;
  chunks: RetrievalChunk[];
  source: 'redis-exact' | 'redis-tuple' | 'fresh';
  builtAt: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 32);
}

function packetKey(queryHash: string) {
  return `ace:retrieval:packet:${queryHash}`;
}

function resultKey(queryHash: string) {
  return `ace:stream:result:${queryHash}`;
}

function clampContext(packet: RetrievalPacket): string {
  const raw = packet.chunks
    .map((c, i) => `[${i + 1}] ${c.path} (score ${c.score.toFixed(3)})\n${c.summary}`)
    .join('\n\n');
  return raw.length > MAX_PACKET_CONTEXT_CHARS ? raw.slice(0, MAX_PACKET_CONTEXT_CHARS) + '\n…' : raw;
}

// ─── T3: fresh build ──────────────────────────────────────────────────────────

async function buildFreshPacket(query: string, queryHash: string): Promise<RetrievalPacket> {
  let chunks: RetrievalChunk[] = [];
  try {
    const embResult = await generateEmbeddings([query]);
    if (embResult.vectors?.length) {
      const vector = embResult.vectors[0];
      const hits = await searchQdrantCode(vector, 12, undefined, 'codebase_chunks_768');
      const vectorMatches = hits.map((h) => ({ id: h.stable_key, score: h.semantic_score }));
      const ranked = await retrieveRankedEntities(vectorMatches);
      chunks = ranked.slice(0, 10).map((r) => {
        const h = hits.find((x) => x.stable_key === r.id);
        return {
          stableKey: r.id,
          path: h?.file_path || '',
          score: Number(r.finalScore.toFixed(3)),
          summary: (h?.content || '').slice(0, 220),
          labels: h?.topo_class ? [h.topo_class] : [],
        };
      });
    }
  } catch (err) {
    console.warn('[packet-stream-cache] Fresh build failed (non-fatal):', err);
  }
  return { queryHash, query, chunks, source: 'fresh', builtAt: new Date().toISOString() };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Resolves a retrieval packet for the given query.
 * Returns the packet and a ready-to-inject system context string.
 */
export async function resolvePacketForQuery(query: string): Promise<{
  packet: RetrievalPacket;
  systemContext: string;
}> {
  const queryHash = hashQuery(query);
  const redis = getRedis();

  // T1: Redis exact packet
  try {
    const raw = await redis.get(packetKey(queryHash));
    if (raw) {
      const packet: RetrievalPacket = JSON.parse(raw);
      packet.source = 'redis-exact';
      return { packet, systemContext: clampContext(packet) };
    }
  } catch {
    // non-fatal
  }

  // T3: Fresh build (no Postgres/NES packet table in scope yet)
  const packet = await buildFreshPacket(query, queryHash);

  // Write T1 cache for next request
  try {
    await redis.setex(packetKey(queryHash), PACKET_TTL, JSON.stringify(packet));
  } catch {
    // non-fatal
  }

  return { packet, systemContext: clampContext(packet) };
}

/**
 * Writes the assembled stream result back to Redis after onFinish fires.
 * Also refreshes the retrieval packet TTL so a warm cache hit covers the
 * next identical query even after the 5-min packet window expires.
 */
export async function writeStreamResultToMemory(opts: {
  queryHash: string;
  packet: RetrievalPacket;
  text: string;
  durationMs?: number;
}): Promise<void> {
  const { queryHash, packet, text, durationMs } = opts;
  if (!text) return;

  const redis = getRedis();
  try {
    await Promise.all([
      // Persist assembled text for potential cache replay
      redis.setex(resultKey(queryHash), RESULT_TTL, text),
      // Refresh packet TTL — same query gets a warm packet hit for 5 more min
      redis.expire(packetKey(queryHash), PACKET_TTL),
    ]);
    console.log(
      `[packet-stream-cache] write-back ok queryHash=${queryHash.slice(0, 12)} ` +
        `text=${text.length}c chunks=${packet.chunks.length} durationMs=${durationMs ?? '?'}`
    );
  } catch (err) {
    console.warn('[packet-stream-cache] Write-back failed (non-fatal):', err);
  }
}

/**
 * Convenience: build a system prompt string from packet context.
 * The route can pass this as the `system` field to streamText().
 */
export function buildSystemPrompt(systemContext: string): string {
  const base = 'You are a legal AI assistant. Provide concise, professional legal analysis.';
  if (!systemContext.trim()) return base;
  return `${base}\n\nRelevant codebase context:\n${systemContext}`;
}
