/**
 * ace-packet-store.ts
 *
 * Full ACE packet CRUD over Redis/Valkey.
 *
 * Key schema:
 *   ace:packet:latest                    — most recently written packet ID
 *   ace:packet:<packet_id>               — full packet JSON
 *   ace:cluster:<som_row>:<som_col>      — cluster-scoped packet (for SOM router)
 *   ace:source_ref:<sha256-8>            — source_ref → packet_id index
 *   ace:feature:<feature_id>             — feature → [packet_ids] list
 *   ace:workspace_task:<task_id>         — task → packet_id
 *
 * Ownership rule:
 *   Parent Atlas owns IDs (source_ref, feature_id, cluster_id).
 *   Redis stores hot packets keyed by those IDs.
 *   Qdrant stores the vectors + atlas_node_id payload.
 *   Bifrost logs retrieval telemetry per queryHash.
 */

import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import crypto from 'crypto';
import { z } from 'zod';

export interface AceFullPacket {
  packet_id: string;
  packet_ulid: string | null;
  title_id: string | null;
  query: string;
  query_hash: string;
  // Parent Atlas identity
  source_refs: string[];
  feature_ids: string[];
  lane_ids: string[];
  cluster_id: string | null;       // SOM cluster "row:col"
  workspace_task_id: string | null;
  used_concepts?: string[];
  lexical_nouns?: string[];
  lexical_verbs?: string[];
  lexical_adverbs_ly?: string[];
  adjacency_packet_keys?: string[];
  adjacency_feature_ids?: string[];
  adjacency_source_refs?: string[];
  packed_arrays?: {
    packet_keys: string[];
    feature_ids: string[];
    source_refs: string[];
    title_ids: string[];
  };
  columnar_tables?: string[];
  mmap_vector_refs?: string[];
  // Retrieval evidence
  qdrant_point_ids: (string | number)[];
  neo4j_neighbor_ids: string[];
  redis_hot_keys: string[];
  // Provenance fields (NES/CHROM + Engram + KAG/DAG)
  som_cluster: string | null;         // "row:col" from Qdrant payload som_cluster field
  engram_ids: string[];               // ace:engram:query:{hash} keys touched this request
  kag_hits: number;                   // KAG graph neighbor hit count
  dag_hits: number;                   // DAG (directed graph) hit count
  nes_chrom_packet_keys: string[];    // nes:* packet keys written to Postgres this request
  // Assembled context
  prompt_context: string;          // compact context string for Gemma4
  ranked_cards: Array<{
    source_ref: string;
    score: number;
    feature_id: string | null;
    snippet: string;
  }>;
  // Telemetry
  cache_hit: 'redis' | 'bifrost' | 'qdrant' | 'none';
  latency_ms: number;
  degraded: boolean;
  created_at: string;
  ttl_seconds: number;
}

const AceFullPacketSchema = z.object({
  packet_id: z.string().min(1),
  packet_ulid: z.string().min(1).nullable(),
  title_id: z.string().min(1).nullable(),
  query: z.string().min(1),
  query_hash: z.string().min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  feature_ids: z.array(z.string().min(1)),
  lane_ids: z.array(z.string().min(1)),
  cluster_id: z.string().regex(/^\d+:\d+$/).nullable(),
  workspace_task_id: z.string().min(1).nullable(),
  used_concepts: z.array(z.string().min(1)).default([]),
  lexical_nouns: z.array(z.string().min(1)).default([]),
  lexical_verbs: z.array(z.string().min(1)).default([]),
  lexical_adverbs_ly: z.array(z.string().min(1)).default([]),
  adjacency_packet_keys: z.array(z.string().min(1)).default([]),
  adjacency_feature_ids: z.array(z.string().min(1)).default([]),
  adjacency_source_refs: z.array(z.string().min(1)).default([]),
  packed_arrays: z.object({
    packet_keys: z.array(z.string().min(1)).default([]),
    feature_ids: z.array(z.string().min(1)).default([]),
    source_refs: z.array(z.string().min(1)).default([]),
    title_ids: z.array(z.string().min(1)).default([]),
  }).default({
    packet_keys: [],
    feature_ids: [],
    source_refs: [],
    title_ids: [],
  }),
  columnar_tables: z.array(z.string().min(1)).default([]),
  mmap_vector_refs: z.array(z.string().min(1)).default([]),
  qdrant_point_ids: z.array(z.union([z.string(), z.number()])),
  neo4j_neighbor_ids: z.array(z.string().min(1)),
  redis_hot_keys: z.array(z.string().min(1)),
  som_cluster: z.string().nullable(),
  engram_ids: z.array(z.string().min(1)),
  kag_hits: z.number().int().nonnegative(),
  dag_hits: z.number().int().nonnegative(),
  nes_chrom_packet_keys: z.array(z.string().min(1)),
  prompt_context: z.string(),
  ranked_cards: z.array(z.object({
    source_ref: z.string().min(1),
    score: z.number(),
    feature_id: z.string().nullable(),
    snippet: z.string(),
  })),
  cache_hit: z.enum(['redis', 'bifrost', 'qdrant', 'none']),
  latency_ms: z.number().nonnegative(),
  degraded: z.boolean(),
  created_at: z.string().datetime(),
  ttl_seconds: z.number().int().positive(),
});

const DEFAULT_TTL = 604_800;   // 7d
const CLUSTER_TTL = 604_800;   // 7d for cluster-scoped packets

function packetKey(id: string): string { return `ace:packet:${id}`; }
function clusterPacketKey(row: number, col: number): string { return `ace:cluster:${row}:${col}`; }
function sourceRefKey(ref: string): string {
  const h = crypto.createHash('sha256').update(ref).digest('hex').slice(0, 8);
  return `ace:source_ref:${h}`;
}
function featureKey(featureId: string): string { return `ace:feature:${featureId}`; }
function taskKey(taskId: string): string { return `ace:workspace_task:${taskId}`; }

export function makePacketId(query: string): string {
  return crypto.createHash('sha256').update(query + Date.now()).digest('hex').slice(0, 16);
}

export function makeQueryHash(query: string): string {
  return crypto.createHash('sha256').update(query).digest('hex').slice(0, 16);
}

// ── CREATE / WRITE ────────────────────────────────────────────────────────

export async function writeAcePacket(
  packet: Omit<AceFullPacket, 'packet_id' | 'created_at'>,
  opts: { ttl?: number; asLatest?: boolean } = {}
): Promise<AceFullPacket> {
  const redis = getValkeyClient();
  const ttl = opts.ttl ?? DEFAULT_TTL;
  const full: AceFullPacket = {
    ...packet,
    packet_id: makePacketId(packet.query),
    packet_ulid: packet.packet_ulid ?? null,
    title_id: packet.title_id ?? null,
    created_at: new Date().toISOString(),
    ttl_seconds: ttl,
  };
  AceFullPacketSchema.parse(full);

  const pipeline = redis.pipeline();

  // Primary packet key
  pipeline.set(packetKey(full.packet_id), JSON.stringify(full), 'EX', ttl);

  // Latest pointer
  if (opts.asLatest !== false) {
    pipeline.set('ace:packet:latest', full.packet_id, 'EX', ttl);
  }

  // SOM cluster key
  if (full.cluster_id) {
    const m = full.cluster_id.match(/^(\d+):(\d+)$/);
    if (m) {
      pipeline.set(clusterPacketKey(+m[1], +m[2]), JSON.stringify(full), 'EX', CLUSTER_TTL);
    }
  }

  // source_ref → packet_id index
  for (const ref of full.source_refs) {
    pipeline.set(sourceRefKey(ref), full.packet_id, 'EX', ttl);
  }

  // feature_id → packet_id list (LPUSH, keep last 10)
  for (const fid of full.feature_ids) {
    pipeline.lpush(featureKey(fid), full.packet_id);
    pipeline.ltrim(featureKey(fid), 0, 9);
    pipeline.expire(featureKey(fid), ttl);
  }

  // workspace_task → packet_id
  if (full.workspace_task_id) {
    pipeline.set(taskKey(full.workspace_task_id), full.packet_id, 'EX', ttl);
  }

  await pipeline.exec();
  return full;
}

// ── READ ─────────────────────────────────────────────────────────────────

export async function readAcePacketById(packetId: string): Promise<AceFullPacket | null> {
  const redis = getValkeyClient();
  const raw = await redis.get(packetKey(packetId));
  if (!raw) return null;
  try { return JSON.parse(raw) as AceFullPacket; } catch { return null; }
}

export async function readLatestAcePacket(): Promise<AceFullPacket | null> {
  const redis = getValkeyClient();
  const id = await redis.get('ace:packet:latest');
  if (!id) return null;
  return readAcePacketById(id);
}

export async function readAcePacketBySourceRef(sourceRef: string): Promise<AceFullPacket | null> {
  const redis = getValkeyClient();
  const id = await redis.get(sourceRefKey(sourceRef));
  if (!id) return null;
  return readAcePacketById(id);
}

export async function readAcePacketByCluster(row: number, col: number): Promise<AceFullPacket | null> {
  const redis = getValkeyClient();
  const raw = await redis.get(clusterPacketKey(row, col));
  if (!raw) return null;
  try { return JSON.parse(raw) as AceFullPacket; } catch { return null; }
}

export async function readAcePacketsByFeature(featureId: string, limit = 5): Promise<AceFullPacket[]> {
  const redis = getValkeyClient();
  const ids = await redis.lrange(featureKey(featureId), 0, limit - 1);
  const packets = await Promise.all(ids.map(id => readAcePacketById(id)));
  return packets.filter((p): p is AceFullPacket => p !== null);
}

export async function readAcePacketByTask(taskId: string): Promise<AceFullPacket | null> {
  const redis = getValkeyClient();
  const id = await redis.get(taskKey(taskId));
  if (!id) return null;
  return readAcePacketById(id);
}

// ── UPDATE ────────────────────────────────────────────────────────────────

export async function updateAcePacket(
  packetId: string,
  patch: Partial<Pick<AceFullPacket, 'prompt_context' | 'ranked_cards' | 'cache_hit' | 'latency_ms' | 'degraded'>>
): Promise<AceFullPacket | null> {
  const existing = await readAcePacketById(packetId);
  if (!existing) return null;
  const updated: AceFullPacket = { ...existing, ...patch };
  const redis = getValkeyClient();
  await redis.set(packetKey(packetId), JSON.stringify(updated), 'EX', existing.ttl_seconds);
  return updated;
}

// ── DELETE ────────────────────────────────────────────────────────────────

export async function deleteAcePacket(packetId: string): Promise<boolean> {
  const packet = await readAcePacketById(packetId);
  if (!packet) return false;

  const redis = getValkeyClient();
  const pipeline = redis.pipeline();
  pipeline.del(packetKey(packetId));

  for (const ref of packet.source_refs) pipeline.del(sourceRefKey(ref));
  for (const fid of packet.feature_ids) pipeline.lrem(featureKey(fid), 0, packetId);
  if (packet.workspace_task_id) pipeline.del(taskKey(packet.workspace_task_id));

  await pipeline.exec();
  return true;
}

// ── VALIDATION ────────────────────────────────────────────────────────────

export interface AcePacketValidation {
  valid: boolean;
  errors: string[];
}

export function validateAcePacket(p: Partial<AceFullPacket>): AcePacketValidation {
  const result = AceFullPacketSchema.safeParse(p);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    }),
  };
}
