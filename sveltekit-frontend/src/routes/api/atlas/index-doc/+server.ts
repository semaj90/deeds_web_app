/**
 * POST /api/atlas/index-doc
 *
 * Canonical ingestion endpoint for the Parent Atlas. Embeds a summary, mints
 * a `packet_kind=doc` packet, and writes it to every mirror store along the
 * frozen lineage chain:
 *
 *   directory_path → source_ref → file_path → function_symbol → feature_id
 *     → feature_label → packet_key → summary → qdrant_point_id → redis_key
 *     → cold_storage_manifest
 *
 * See c:/Users/james/Videos/deeds-web-app/CLAUDE.md §"Canonical Lineage Contract".
 *
 * Writes (all idempotent, fail-open):
 *   - Postgres atlas_packets (ON CONFLICT (packet_id) DO UPDATE) — canonical truth
 *   - Qdrant codebase_chunks_768 (named vector 'content', payload mirrors contract)
 *   - Redis bifrost:packet:{packet_key} (TTL 7d)
 *
 * Request:
 *   {
 *     text:           string                  // required, max 8000 chars
 *     summary?:       string                  // explicit override (defaults to text)
 *     source_ref:     string                  // required — what this doc refers to
 *     feature_id?:    string                  // default 'docs.misc'
 *     feature_label?: string                  // default 'Misc Documentation'
 *     domain_class?:  string                  // default 'admin_observability'
 *     concept_ids?:   string[]                // default []
 *     community_id?:  string | null           // default null
 *     directory_path?: string                 // derived from source_ref if omitted
 *     file_path?:     string                  // defaults to source_ref
 *     function_symbol?: string | null         // default null
 *     reward_prior?:  number                  // [0,1], default 0.5
 *   }
 *
 * Response:
 *   {
 *     ok:           true
 *     packet_key:   string
 *     stores: {
 *       postgres:   'ok' | 'failed'
 *       qdrant:     'ok' | 'failed' | 'skipped'
 *       redis:      'ok' | 'failed' | 'skipped'
 *     }
 *     packet:       AtlasPacketShape          // canonical contract shape
 *     timing_ms:    { embed, postgres, qdrant, redis, total }
 *   }
 *
 * Verification (after a successful write):
 *   curl -s -X POST http://localhost:5173/api/atlas/search \
 *     -H 'Content-Type: application/json' \
 *     -d '{"query":"<some text from the summary>","top_k":5}'
 *   → the new packet_key should appear in the top hits.
 */

import { json }           from '@sveltejs/kit';
import { z }              from 'zod';
import { createHash }     from 'node:crypto';
import { ENV }            from '$lib/server/env.server.js';
import type { RequestHandler } from './$types';

// ── Request schema ─────────────────────────────────────────────────────────────

const IndexDocSchema = z.object({
  text:            z.string().min(1).max(8000),
  summary:         z.string().min(1).max(2000).optional(),
  source_ref:      z.string().min(1).max(500),
  feature_id:      z.string().max(200).optional().default('docs.misc'),
  feature_label:   z.string().max(200).optional().default('Misc Documentation'),
  domain_class:    z.string().max(64).optional().default('admin_observability'),
  concept_ids:     z.array(z.string()).max(32).optional().default([]),
  community_id:    z.string().nullable().optional().default(null),
  directory_path:  z.string().max(500).optional(),
  file_path:       z.string().max(500).optional(),
  function_symbol: z.string().max(200).nullable().optional().default(null),
  reward_prior:    z.number().min(0).max(1).optional().default(0.5),
});

// ── Config ─────────────────────────────────────────────────────────────────────

const QDRANT_URL = ENV.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const REDIS_TTL_SEC = 7 * 86_400; // 7 days

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Stable 16-hex packet_key from source_ref + packet_kind. */
function mintPacketKey(packetKind: string, sourceRef: string): string {
  return createHash('sha256').update(`${packetKind}:${sourceRef}`).digest('hex').slice(0, 16);
}

/** Derive directory_path from source_ref when not provided. */
function deriveDirectoryPath(sourceRef: string): string {
  // If source_ref looks like a file path (has a '/' and a file extension), use the dirname.
  const lastSlash = sourceRef.lastIndexOf('/');
  if (lastSlash > 0 && /\.[a-z0-9]{1,8}(#.*)?$/i.test(sourceRef)) {
    return sourceRef.slice(0, lastSlash);
  }
  // For virtual refs like 'proto/active/foo.proto#Service.Method', strip the anchor.
  const hashIdx = sourceRef.indexOf('#');
  if (hashIdx > 0) return sourceRef.slice(0, hashIdx).split('/').slice(0, -1).join('/') || sourceRef.slice(0, hashIdx);
  return sourceRef;
}

/** Embed text via Ollama with EmbeddingGemma → nomic-embed-text fallback. */
async function embedText(text: string): Promise<number[] | null> {
  const _raw = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
  const ollamaBase = _raw.startsWith('http') ? _raw : `http://${_raw.includes(':') ? _raw : `${_raw}:11434`}`;

  for (const model of ['embeddinggemma:latest', 'nomic-embed-text:latest']) {
    try {
      const res = await fetch(`${ollamaBase}/api/embeddings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model, prompt: text.slice(0, 2048) }),
        signal:  AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const d = await res.json() as { embedding?: number[] };
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next model */ }
  }
  return null;
}

// ── Postgres writer ────────────────────────────────────────────────────────────

async function writePostgres(packet: CanonicalPacket): Promise<boolean> {
  try {
    const { db } = await import('$lib/server/db/client.js');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      INSERT INTO atlas_packets
        (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
         summary, payload, source_kind, created_at, updated_at)
      VALUES (
        ${packet.packet_key},
        ${packet.packet_key},
        ${packet.packet_key},
        ${packet.source_ref},
        ${packet.feature_id},
        ${packet.community_id},
        ${packet.summary},
        ${JSON.stringify(packet)}::jsonb,
        ${packet.packet_kind},
        NOW(), NOW()
      )
      ON CONFLICT (packet_id) DO UPDATE SET
        summary     = EXCLUDED.summary,
        payload     = EXCLUDED.payload,
        source_ref  = EXCLUDED.source_ref,
        feature_id  = EXCLUDED.feature_id,
        packet_key  = EXCLUDED.packet_key,
        source_kind = EXCLUDED.source_kind,
        updated_at  = NOW()
    `);
    return true;
  } catch (e) {
    console.warn('[index-doc] postgres write failed:', (e as Error).message);
    return false;
  }
}

// ── Qdrant writer ──────────────────────────────────────────────────────────────

async function writeQdrant(packet: CanonicalPacket, vector: number[]): Promise<boolean> {
  try {
    // Qdrant point IDs must be uint64 OR uuid — convert the 16-hex packet_key to a
    // hex-derived numeric id by parsing the first 15 hex chars (fits in safe int range).
    // For a fully stable mapping we use the packet_key as a payload field and assign
    // a deterministic numeric id from sha256.
    const idBytes = createHash('sha256').update(packet.packet_key).digest();
    const pointId = Number(BigInt('0x' + idBytes.subarray(0, 7).toString('hex')) & BigInt('0x1FFFFFFFFFFFFF'));

    // Annotate the packet with its qdrant_point_id BEFORE writing — keeps the mirror honest.
    (packet.embedding as Record<string, unknown>).qdrant_point_id = String(pointId);

    // wait=false → ack-only; HNSW reindex happens async. Cheap (~2ms) instead of ~8s
    // sync wait against a 54k-point collection. Subsequent search hits land within
    // ~1s as the index commits. For canonical-truth this is correct: Postgres is
    // already the source of truth; Qdrant is a search-tier mirror with eventual
    // consistency by design.
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        points: [{
          id: pointId,
          vector: { content: vector },
          payload: {
            // Canonical lineage contract fields (mirrors Postgres exactly)
            directory_path: packet.directory_path,
            source_ref:     packet.source_ref,
            file_path:      packet.file_path,
            function_symbol: packet.function_symbol,
            feature_id:     packet.feature_id,
            feature_label:  packet.feature_label,
            packet_key:     packet.packet_key,
            packet_kind:    packet.packet_kind,
            packet_type:    'doc',
            summary:        packet.summary,
            domain_class:   packet.domain_class,
            concept_ids:    packet.concept_ids,
            community_id:   packet.community_id,
            community_confidence: 1.0,
            reward_prior:   packet.reward_prior,
            // Stage 1.5 / Stage 1.7 live signals — start at 0 (overwritten by cascade route)
            ann_turbovec_score: 0,
            gpu_cosine_score:   0,
            som_cache_hit:      0,
            // Lineage backref
            cold_storage_uri: packet.cold_storage.uri,
            created_at: new Date().toISOString(),
          },
        }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch (e) {
    console.warn('[index-doc] qdrant write failed:', (e as Error).message);
    return false;
  }
}

// ── Redis writer ───────────────────────────────────────────────────────────────

async function writeRedis(packet: CanonicalPacket): Promise<boolean> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    await redis.set(packet.cache.redis_key, JSON.stringify(packet), 'EX', REDIS_TTL_SEC);
    return true;
  } catch (e) {
    console.warn('[index-doc] redis write failed:', (e as Error).message);
    return false;
  }
}

// ── Canonical packet shape ─────────────────────────────────────────────────────

interface CanonicalPacket {
  directory_path:  string;
  source_ref:      string;
  file_path:       string;
  function_symbol: string | null;
  feature_id:      string;
  feature_label:   string;
  packet_key:      string;
  packet_kind:     'doc';
  summary:         string;
  domain_class:    string;
  concept_ids:     string[];
  community_id:    string | null;
  reward_prior:    number;
  embedding: {
    model:           string;
    dim:             number;
    qdrant_point_id: string | null;
  };
  cache: {
    redis_key:    string;
    centroid_key: string;
  };
  cold_storage: {
    manifest_id:      string;
    uri:              string | null;
    restore_verified: boolean;
  };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
  const tTotal = Date.now();
  const body   = await request.json().catch(() => null);
  const parsed = IndexDocSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  const sourceRef     = d.source_ref;
  const directoryPath = d.directory_path ?? deriveDirectoryPath(sourceRef);
  const filePath      = d.file_path      ?? sourceRef;
  const summary       = d.summary        ?? d.text.slice(0, 600);
  const packetKey     = mintPacketKey('doc', sourceRef);

  // ── Embed ────────────────────────────────────────────────────────────────────
  const tEmbed = Date.now();
  const vector = await embedText(d.text);
  const embedMs = Date.now() - tEmbed;

  // Build the canonical packet up front — every writer mutates the SAME object
  // so qdrant_point_id and cold_storage manifest_id propagate consistently.
  const packet: CanonicalPacket = {
    directory_path:  directoryPath,
    source_ref:      sourceRef,
    file_path:       filePath,
    function_symbol: d.function_symbol,
    feature_id:      d.feature_id,
    feature_label:   d.feature_label,
    packet_key:      packetKey,
    packet_kind:     'doc',
    summary,
    domain_class:    d.domain_class,
    concept_ids:     d.concept_ids,
    community_id:    d.community_id,
    reward_prior:    d.reward_prior,
    embedding: {
      model:           'embeddinggemma',
      dim:             768,
      qdrant_point_id: null,   // filled in by writeQdrant() before persistence
    },
    cache: {
      redis_key:    `bifrost:packet:${packetKey}`,
      centroid_key: `centroid:feature:${d.feature_id}`,
    },
    cold_storage: {
      manifest_id:      `manifest:${packetKey}`,
      uri:              null,
      restore_verified: false,
    },
  };

  // ── Postgres (canonical truth — write first so mirrors point at a real row) ──
  const tPg = Date.now();
  const pgOk = await writePostgres(packet);
  const pgMs = Date.now() - tPg;

  // ── Qdrant (vector mirror) ──────────────────────────────────────────────────
  const tQd = Date.now();
  let qdrantStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  if (vector) {
    qdrantStatus = (await writeQdrant(packet, vector)) ? 'ok' : 'failed';
  }
  const qdMs = Date.now() - tQd;

  // If Qdrant wrote successfully, re-persist the packet to Postgres so the
  // qdrant_point_id mutation propagates. Cheap upsert thanks to ON CONFLICT.
  if (qdrantStatus === 'ok' && pgOk) {
    await writePostgres(packet);
  }

  // ── Redis (hot cache mirror) ────────────────────────────────────────────────
  const tRd = Date.now();
  const redisOk = await writeRedis(packet);
  const rdMs = Date.now() - tRd;

  const totalMs = Date.now() - tTotal;

  return json({
    ok: true,
    packet_key: packetKey,
    stores: {
      postgres: pgOk     ? 'ok' : 'failed',
      qdrant:   qdrantStatus,
      redis:    redisOk  ? 'ok' : 'failed',
    },
    packet,
    timing_ms: {
      embed:    embedMs,
      postgres: pgMs,
      qdrant:   qdMs,
      redis:    rdMs,
      total:    totalMs,
    },
  });
};
